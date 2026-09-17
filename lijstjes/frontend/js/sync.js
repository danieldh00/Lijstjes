import api from './api.js';
import * as storage from './storage.js';

const listeners = new Set();
const statusListeners = new Set();

let status = { state: navigator.onLine ? 'idle' : 'offline', pending: storage.getOutboxSize(), error: null };
let flushing = false;
let pollTimer = null;

function notify() {
  for (const cb of listeners) cb(storage.getSnapshot());
}

function setStatus(patch) {
  status = { ...status, ...patch, pending: storage.getOutboxSize() };
  for (const cb of statusListeners) cb(status);
}

function onChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function onStatus(cb) {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

async function flush() {
  if (flushing) return;
  const pending = storage.getOutboxSize();
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  flushing = true;
  setStatus({ state: 'syncing' });
  try {
    if (pending > 0) {
      const mutations = JSON.parse(JSON.stringify(storage.getOutbox()));
      const result = await api.sync(mutations);
      storage.applySyncResult(result);
    } else {
      const snapshot = await api.content();
      storage.replaceSnapshot(snapshot);
    }
    setStatus({ state: 'synced', error: null });
    notify();
  } catch (err) {
    setStatus({ state: 'error', error: err.message });
  } finally {
    flushing = false;
  }
}

function scheduleFlush(delay = 400) {
  clearTimeout(scheduleFlush._t);
  scheduleFlush._t = setTimeout(flush, delay);
}

// Sjablonen wijzigen zelden en zijn geen Home Assistant-data, dus die lopen
// niet mee in de gewone outbox-flush -- gewoon los ophalen en cachen; lukt
// dat niet (offline, nog niet eerder gesynchroniseerd), dan blijft de
// laatst gecachete set gewoon staan.
async function refreshTemplates() {
  try {
    const { templates } = await api.templates();
    storage.setTemplatesCache(templates);
    notify();
  } catch (err) {
    // stil falen -- geen netwerk, of nog geen sjablonen aangemaakt
  }
}

// Winkels wijzigen net als sjablonen zelden en zijn geen Home
// Assistant-data -- zelfde behandeling: los ophalen en cachen.
async function refreshStores() {
  try {
    const { stores } = await api.stores();
    storage.setStoresCache(stores);
    notify();
  } catch (err) {
    // stil falen -- geen netwerk, of nog geen winkels aangemaakt
  }
}

// Welke lijstjes Sjablonen/Winkels tonen -- zelfde behandeling: los ophalen
// en cachen, geen Home Assistant-data.
async function refreshListSettings() {
  try {
    const settings = await api.listSettings();
    storage.setAllListSettingsCache(settings);
    notify();
  } catch (err) {
    // stil falen -- geen netwerk
  }
}

// Volgorde van lijstjes -- zelfde behandeling: los ophalen en cachen, geen
// Home Assistant-data.
async function refreshListOrder() {
  try {
    const { order } = await api.listOrder();
    storage.setListOrderCache(order);
    notify();
  } catch (err) {
    // stil falen -- geen netwerk
  }
}

// Welke winkel bij een itemnaam hoort ("melk" -> "Albert Heijn") -- zelfde
// behandeling: los ophalen en cachen, geen Home Assistant-data.
async function refreshItemStores() {
  try {
    const { itemStores } = await api.itemStores();
    storage.setItemStoresCache(itemStores);
  } catch (err) {
    // stil falen -- geen netwerk
  }
}

// Meteen lokaal onthouden (werkt ook offline) en de server op de hoogte
// stellen als dat lukt -- geen kritieke data, dus geen outbox/retry nodig:
// mislukt de aanroep, dan blijft de vorige (of geen) koppeling gewoon staan
// en probeert de eerstvolgende keer dat dit item met een winkel opgeslagen
// wordt het gewoon opnieuw.
function rememberItemStore(entityId, itemName, store) {
  storage.rememberItemStoreLocal(entityId, itemName, store);
  api.rememberItemStore(entityId, itemName, store).catch(() => {});
}

async function init() {
  // Voordat we ook maar iets over het netwerk proberen: is er een snapshot
  // die de service worker op de achtergrond heeft opgehaald (via een
  // pushmelding terwijl de app niet open stond)? Zo ja, die is mogelijk
  // verser dan wat er nu lokaal staat -- meteen tonen, ook zonder netwerk.
  if (await storage.adoptBackgroundSnapshot()) {
    notify();
  }

  // Komt er terwijl de app open staat alsnog zo'n achtergrondverversing
  // binnen (bv. een pushmelding op een ander toestel, of de app staat op de
  // achtergrondtab), neem 'm dan meteen over in plaats van te wachten op de
  // volgende poll.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type === 'snapshot-updated' && (await storage.adoptBackgroundSnapshot())) {
        notify();
      }
    });
  }

  window.addEventListener('online', () => {
    setStatus({ state: 'idle' });
    flush();
  });
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));

  pollTimer = setInterval(flush, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });

  // Op iOS/Safari (vooral een geïnstalleerde PWA die uit de achtergrond/
  // appswitcher terugkomt) vuurt visibilitychange lang niet altijd af, en
  // kan de pagina bovendien ongewijzigd uit de bfcache worden hersteld
  // zonder dat onze JS opnieuw start -- dan blijft de laatst gerenderde
  // (mogelijk verouderde) snapshot gewoon staan. pageshow en focus zijn op
  // iOS betrouwbaarder voor "de app is weer in beeld, haal verse data op".
  window.addEventListener('pageshow', () => flush());
  window.addEventListener('focus', () => flush());

  flush();
  refreshTemplates();
  refreshStores();
  refreshListSettings();
  refreshListOrder();
  refreshItemStores();
}

function mutateAndSync(mutateFn) {
  const result = mutateFn();
  notify();
  scheduleFlush();
  return result;
}

export {
  init,
  onChange,
  onStatus,
  flush,
  mutateAndSync,
  refreshTemplates,
  refreshStores,
  refreshListSettings,
  refreshListOrder,
  refreshItemStores,
  rememberItemStore,
};
