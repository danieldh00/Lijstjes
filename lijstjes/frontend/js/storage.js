// Lokale, offline-first opslag: één "workingState" (lijstjes + items) dat
// direct gerenderd wordt, plus een "outbox" van nog niet naar Home Assistant
// gestuurde wijzigingen. Alles staat in localStorage zodat de app na het
// sluiten en heropenen (ook zonder netwerk) meteen weer bruikbaar is.

const SNAPSHOT_KEY = 'lijstjes:snapshot';
const OUTBOX_KEY = 'lijstjes:outbox';
const TEMPLATES_KEY = 'lijstjes:templates';
const STORES_KEY = 'lijstjes:stores';
const LIST_SETTINGS_KEY = 'lijstjes:list-settings';
const LIST_ORDER_KEY = 'lijstjes:list-order';
const ITEM_STORES_KEY = 'lijstjes:item-stores';
const ITEM_HISTORY_KEY = 'lijstjes:item-history';

// Zelfde cache als sw.js gebruikt om de snapshot te verversen wanneer een
// pushmelding binnenkomt terwijl de app niet open staat -- localStorage is
// niet bereikbaar vanuit een service worker, de Cache API wel vanuit beide.
const BG_CACHE_NAME = 'lijstjes-data-v1';
const BG_SNAPSHOT_REQUEST = '/__offline-snapshot__';

function uuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Opslag vol of niet beschikbaar (privé-venster e.d.) -- de app blijft
    // werken voor deze sessie, alleen zonder persistentie.
  }
}

const state = {
  snapshot: readJSON(SNAPSHOT_KEY, { lists: [], items: {}, syncedAt: null }),
  outbox: readJSON(OUTBOX_KEY, []),
  templates: readJSON(TEMPLATES_KEY, []),
  stores: readJSON(STORES_KEY, []),
  listSettings: readJSON(LIST_SETTINGS_KEY, {}),
  listOrder: readJSON(LIST_ORDER_KEY, []),
  itemStores: readJSON(ITEM_STORES_KEY, []),
  itemHistory: readJSON(ITEM_HISTORY_KEY, {}),
};

function persist() {
  writeJSON(SNAPSHOT_KEY, state.snapshot);
  writeJSON(OUTBOX_KEY, state.outbox);
}

function getSnapshot() {
  return state.snapshot;
}

// Alles wat de views uit deze module tekenen, als één vergelijkbare string.
// Hiermee kan de router goedkoop bepalen of een her-render überhaupt iets
// aan het scherm zou veranderen. `syncedAt` zit er bewust niet in: die is bij
// elke poll anders (ook als er inhoudelijk niets wijzigde) en zou daarmee na
// elke achtergrondsync een volledige her-render forceren.
function getStateSignature() {
  return JSON.stringify({
    lists: state.snapshot.lists,
    items: state.snapshot.items,
    templates: state.templates,
    stores: state.stores,
    listSettings: state.listSettings,
    listOrder: state.listOrder,
  });
}

// Sjablonen (snel meerdere items in één keer toevoegen, bv. een maaltijd)
// zijn geen Home Assistant-concept en leven dus niet in de snapshot/outbox
// -- gewoon een los gecachet lijstje per lijst, aparte persist zodat een
// mislukte schrijfactie van de een de ander niet raakt.
function getTemplates(entityId) {
  return state.templates.filter((t) => t.entity_id === entityId);
}

function setTemplatesCache(templates) {
  state.templates = templates;
  writeJSON(TEMPLATES_KEY, state.templates);
}

// Winkels ("waar moet dit gehaald worden") -- zelfde opzet als sjablonen:
// een los gecachet lijstje per lijst, niet iets van Home Assistant zelf.
function getStores(entityId) {
  return state.stores.filter((s) => s.entity_id === entityId);
}

function setStoresCache(stores) {
  state.stores = stores;
  writeJSON(STORES_KEY, state.stores);
}

// Onthoudt welke winkel bij een itemnaam hoort ("melk" -> "Albert Heijn"),
// zodat je die niet elke keer opnieuw hoeft te kiezen bij een terugkerend
// item -- ook nadat het oude item allang afgevinkt en opgeruimd is. Zelfde
// opzet als sjablonen/winkels: een los gecachet lijstje, nu alleen als
// key/value-paar per lijst in plaats van objecten met een eigen id.
function normalizeItemKey(name) {
  return String(name || '').trim().toLowerCase();
}

function getItemStoreMemory(entityId) {
  const map = {};
  for (const entry of state.itemStores) {
    if (entry.entity_id === entityId) map[entry.itemKey] = entry.store;
  }
  return map;
}

function setItemStoresCache(itemStores) {
  state.itemStores = itemStores;
  writeJSON(ITEM_STORES_KEY, state.itemStores);
}

// Optimistisch: meteen lokaal bijwerken (werkt ook offline), los van de
// fire-and-forget server-sync in sync.js.
function rememberItemStoreLocal(entityId, itemName, store) {
  const itemKey = normalizeItemKey(itemName);
  if (!itemKey || !store) return;
  const idx = state.itemStores.findIndex((e) => e.entity_id === entityId && e.itemKey === itemKey);
  const entry = { entity_id: entityId, itemKey, store };
  if (idx === -1) state.itemStores.push(entry);
  else state.itemStores[idx] = entry;
  writeJSON(ITEM_STORES_KEY, state.itemStores);
}

// Voorspellende suggesties bij het toevoegen van een item: onthoudt welke
// itemnamen ooit in een lijst zijn getypt (met hoeveel keer en wanneer voor
// het laatst), los van de huidige items -- zo blijft "Melk" een suggestie
// ook nadat het item is afgevinkt en opgeruimd. Puur lokaal (geen HA-concept
// en geen cross-device-behoefte zoals bij de winkel-herinnering hierboven),
// per lijst: { [entityId]: { [genormaliseerd]: { summary, count, lastUsed,
// seenUids } } }. `uid` is optioneel: meegeven voorkomt dat hetzelfde item
// (zelfde uid) via een herhaalde sync-poll of -pull dubbel meetelt.
function bumpItemHistory(entityId, summary, uid) {
  const text = String(summary || '').trim();
  if (!text) return;
  const key = normalizeItemKey(text);
  const bucket = (state.itemHistory[entityId] = state.itemHistory[entityId] || {});
  const entry = (bucket[key] = bucket[key] || { summary: text, count: 0, lastUsed: 0, seenUids: [] });
  entry.summary = text;
  if (uid) {
    if (entry.seenUids.includes(uid)) return;
    entry.seenUids.push(uid);
    if (entry.seenUids.length > 50) entry.seenUids.shift();
  }
  entry.count += 1;
  entry.lastUsed = Date.now();
  writeJSON(ITEM_HISTORY_KEY, state.itemHistory);
}

// Haalt de geschiedenis ook uit een (server-)snapshot, zodat suggesties ook
// meetellen voor items die via Assist/voice, de HA-app of een ander toestel
// zijn toegevoegd -- niet alleen items die via déze knop lokaal zijn gezet.
function recordItemHistoryFromSnapshot(snapshot) {
  for (const [entityId, items] of Object.entries(snapshot.items || {})) {
    for (const item of items) bumpItemHistory(entityId, item.summary, item.uid);
  }
}

// Suggesties voor een lijst op basis van wat er ooit in is getypt: eerst
// voorvoegsel-matches ("mel" -> "Melk"), dan deelmatches, gesorteerd op
// frequentie en (als tiebreaker) recentheid. Wat je al exact hebt getypt
// wordt niet als suggestie teruggegeven (niets meer aan te vullen).
function getItemSuggestions(entityId, query, limit = 5) {
  const bucket = state.itemHistory[entityId];
  const q = normalizeItemKey(query);
  if (!bucket || !q) return [];

  const rank = (a, b) => b.count - a.count || b.lastUsed - a.lastUsed;
  const starts = [];
  const contains = [];
  for (const entry of Object.values(bucket)) {
    const norm = normalizeItemKey(entry.summary);
    if (norm === q) continue;
    if (norm.startsWith(q)) starts.push(entry);
    else if (norm.includes(q)) contains.push(entry);
  }
  starts.sort(rank);
  contains.sort(rank);
  return [...starts, ...contains].slice(0, limit).map((e) => e.summary);
}

// Per lijst: staan Sjablonen/Winkels aan? Niet elk lijstje (bv. Klussen)
// heeft daar iets aan -- default uit, tenzij er al sjablonen/winkels voor
// bestaan (de server bepaalt dat, zie backend/src/listSettings.js).
function getListSettings(entityId) {
  return state.listSettings[entityId] || { templatesEnabled: false, storesEnabled: false };
}

function setAllListSettingsCache(settings) {
  state.listSettings = settings;
  writeJSON(LIST_SETTINGS_KEY, state.listSettings);
}

function setListSettingsCache(entityId, settings) {
  state.listSettings = { ...state.listSettings, [entityId]: settings };
  writeJSON(LIST_SETTINGS_KEY, state.listSettings);
}

function getOutboxSize() {
  return state.outbox.length;
}

function getOutbox() {
  return state.outbox;
}

function hasContent() {
  return !!state.snapshot.syncedAt;
}

function queueMutation(mutation) {
  const full = { clientMutationId: uuid(), ...mutation };
  state.outbox.push(full);
  persist();
  return full;
}

function findList(entityId) {
  return state.snapshot.lists.find((l) => l.entity_id === entityId);
}

function findItem(entityId, uid) {
  return (state.snapshot.items[entityId] || []).find((i) => i.uid === uid);
}

// -- Optimistische lokale mutaties (direct zichtbaar, los van sync) --

function addListLocal(name) {
  const tempId = `local-list:${uuid()}`;
  state.snapshot.lists.push({ entity_id: tempId, name, count: 0, pending: true });
  state.snapshot.items[tempId] = [];
  persist();
  const mutation = queueMutation({ type: 'create_list', name, tempListId: tempId });
  return { tempId, mutation };
}

function renameListLocal(entityId, name) {
  const list = findList(entityId);
  if (!list || list.name === name) return;
  list.name = name;
  persist();
  // Een lijst die nog niet in Home Assistant bestaat (het aanmaken staat nog
  // in de wachtrij) krijgt zijn naam mee uit die create_list-mutatie; die
  // passen we aan in plaats van er een losse hernoem-opdracht achteraan te
  // sturen voor een lijst die de server nog niet kent.
  if (entityId.startsWith('local-list:')) {
    for (const mutation of state.outbox) {
      if (mutation.type === 'create_list' && mutation.tempListId === entityId) mutation.name = name;
    }
    persist();
    return;
  }
  queueMutation({ type: 'rename_list', entity_id: entityId, name });
}

function removeListLocal(entityId) {
  state.snapshot.lists = state.snapshot.lists.filter((l) => l.entity_id !== entityId);
  delete state.snapshot.items[entityId];
  if (entityId.startsWith('local-list:')) {
    // Nog geen echte HA-lijst (het aanmaken stond nog in de wachtrij) --
    // gewoon uit de wachtrij halen, er is niets in HA om te verwijderen.
    state.outbox = state.outbox.filter((m) => m.tempListId !== entityId && m.entity_id !== entityId);
    persist();
    return;
  }
  persist();
  queueMutation({ type: 'delete_list', entity_id: entityId });
}

// Volgorde van lijstjes op het overzicht -- Home Assistant heeft hier geen
// instelling voor, dus dit is een losse, puur app-eigen voorkeur.
function getListOrder() {
  return state.listOrder;
}

function setListOrderCache(order) {
  state.listOrder = order;
  writeJSON(LIST_ORDER_KEY, state.listOrder);
}

function getSortedLists() {
  const lists = state.snapshot.lists;
  const order = state.listOrder;
  const byEntityId = new Map(lists.map((l) => [l.entity_id, l]));
  const sorted = order.map((id) => byEntityId.get(id)).filter(Boolean);
  const seen = new Set(sorted.map((l) => l.entity_id));
  for (const list of lists) {
    if (!seen.has(list.entity_id)) sorted.push(list);
  }
  return sorted;
}

function addItemLocal(entityId, fields) {
  const clientItemId = `local:${uuid()}`;
  const item = {
    uid: clientItemId,
    clientItemId,
    summary: fields.summary,
    status: 'needs_action',
    description: fields.description || undefined,
    due_date: fields.due_date || undefined,
    due_datetime: fields.due_datetime || undefined,
    pending: true,
  };
  state.snapshot.items[entityId] = state.snapshot.items[entityId] || [];
  state.snapshot.items[entityId].push(item);
  bumpCount(entityId);
  bumpItemHistory(entityId, fields.summary, clientItemId);
  persist();
  queueMutation({
    type: 'add_item',
    entity_id: entityId,
    clientItemId,
    summary: fields.summary,
    description: fields.description,
    due_date: fields.due_date,
    due_datetime: fields.due_datetime,
  });
  return item;
}

function updateItemLocal(entityId, uid, changes) {
  const item = findItem(entityId, uid);
  if (!item) return;
  Object.assign(item, changes);
  if (changes.status !== undefined) bumpCount(entityId);
  persist();
  const mutation = { type: 'update_item', entity_id: entityId, ...changes };
  if (item.clientItemId) mutation.clientItemId = item.clientItemId;
  else mutation.uid = uid;
  queueMutation(mutation);
}

function removeItemLocal(entityId, uid) {
  const items = state.snapshot.items[entityId] || [];
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) return;
  const [item] = items.splice(idx, 1);
  bumpCount(entityId);
  persist();
  const mutation = { type: 'remove_item', entity_id: entityId };
  if (item.clientItemId) mutation.clientItemId = item.clientItemId;
  else mutation.uid = uid;
  queueMutation(mutation);
}

// Alle afgevinkte items in één keer weggooien ("Legen"-knop boven de
// Afgevinkt-sectie) -- gewoon removeItemLocal herhaald, zodat elk item op
// dezelfde manier (met clientItemId waar mogelijk) in de wachtrij komt.
function clearCompletedLocal(entityId) {
  const items = state.snapshot.items[entityId] || [];
  const completed = items.filter((i) => i.status === 'completed');
  for (const item of completed) removeItemLocal(entityId, item.uid);
}

function moveItemLocal(entityId, uid, direction) {
  const items = state.snapshot.items[entityId] || [];
  const idx = items.findIndex((i) => i.uid === uid);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= items.length) return;

  const reordered = items.slice();
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(targetIdx, 0, moved);
  state.snapshot.items[entityId] = reordered;
  persist();

  const previousUid = targetIdx === 0 ? null : reordered[targetIdx - 1].uid;
  const mutation = { type: 'move_item', entity_id: entityId, previous_uid: previousUid };
  if (moved.clientItemId) mutation.clientItemId = moved.clientItemId;
  else mutation.uid = uid;
  queueMutation(mutation);
}

function bumpCount(entityId) {
  const list = findList(entityId);
  if (!list) return;
  list.count = (state.snapshot.items[entityId] || []).filter((i) => i.status !== 'completed').length;
}

// -- Verwerken van een sync-respons (server is bron van waarheid) --

function applySyncResult({ results, snapshot: serverSnapshot }) {
  const successIds = new Set();
  const idRemap = { lists: new Map(), items: new Map() };

  for (const result of results) {
    const mutation = state.outbox.find((m) => m.clientMutationId === result.clientMutationId);
    if (!result.ok || !mutation) continue;
    successIds.add(result.clientMutationId);

    if (mutation.type === 'create_list' && result.entity_id) {
      idRemap.lists.set(mutation.tempListId, result.entity_id);
    }
    if (mutation.type === 'add_item' && result.uid && mutation.clientItemId) {
      idRemap.items.set(mutation.clientItemId, result.uid);
    }
  }

  // Alleen gelukte mutaties verdwijnen uit de wachtrij. Een mislukte
  // mutatie (bv. een tijdelijke serverfout) blijft staan en wordt bij de
  // volgende sync opnieuw geprobeerd -- anders verdween de wijziging van
  // de gebruiker stilletjes zodra de (nog oude) servertoestand hieronder
  // wordt overgenomen, en sprong het net bewerkte item terug naar zijn
  // oude waarde.
  state.outbox = state.outbox.filter((m) => !successIds.has(m.clientMutationId));
  const stillPendingEntityIds = new Set(state.outbox.map((m) => m.entity_id || m.tempListId));
  const pendingUidsPerEntity = new Map();
  for (const m of state.outbox) {
    if (!m.entity_id || !m.uid) continue;
    if (!pendingUidsPerEntity.has(m.entity_id)) pendingUidsPerEntity.set(m.entity_id, new Set());
    pendingUidsPerEntity.get(m.entity_id).add(m.uid);
  }

  const nextLists = serverSnapshot.lists.slice();
  const nextItems = {};
  for (const [entityId, items] of Object.entries(serverSnapshot.items)) {
    nextItems[entityId] = items;
  }

  // Lokale lijsten/items die nog op verwerking wachten (of net terug zijn
  // gekomen als tijdelijke local-list:/local: id) blijven behouden totdat ze
  // definitief zijn opgelost.
  for (const list of state.snapshot.lists) {
    if (list.entity_id.startsWith('local-list:') && !idRemap.lists.has(list.entity_id)) {
      nextLists.push(list);
      nextItems[list.entity_id] = state.snapshot.items[list.entity_id] || [];
    }
  }
  for (const [entityId, items] of Object.entries(state.snapshot.items)) {
    if (!stillPendingEntityIds.has(entityId)) continue;

    // Een bestaand item met een nog niet gelukte mutatie (bv. update_item):
    // de servertoestand kan de laatste lokale wijziging dan nog niet
    // bevatten -- de lokale, net bewerkte versie blijft leidend totdat de
    // mutatie alsnog doorkomt.
    const pendingUids = pendingUidsPerEntity.get(entityId);
    if (pendingUids && nextItems[entityId]) {
      const localByUid = new Map(items.map((i) => [i.uid, i]));
      nextItems[entityId] = nextItems[entityId].map((serverItem) =>
        pendingUids.has(serverItem.uid) && localByUid.has(serverItem.uid) ? localByUid.get(serverItem.uid) : serverItem
      );
    }

    // Nog nooit verzonden nieuwe items (tijdelijke local:-uid) kent de
    // server nog helemaal niet -- gewoon toevoegen.
    const pendingLocalItems = items.filter((i) => i.uid.startsWith('local:'));
    if (pendingLocalItems.length && nextItems[entityId]) {
      nextItems[entityId] = nextItems[entityId].concat(pendingLocalItems);
    }
  }

  state.snapshot = { ...serverSnapshot, lists: nextLists, items: nextItems };
  recordItemHistoryFromSnapshot(serverSnapshot);
  persist();
}

// Zuivere pull (geen openstaande outbox): servertoestand is meteen leidend.
function replaceSnapshot(serverSnapshot) {
  state.snapshot = serverSnapshot;
  recordItemHistoryFromSnapshot(serverSnapshot);
  persist();
}

// Neemt de snapshot over die de service worker op de achtergrond heeft
// opgehaald (zie sw.js' push-handler) -- het enige moment waarop de app
// verse data kan hebben zonder zelf open geweest te zijn. Alleen overnemen
// als 'ie nieuwer is en er geen eigen, nog te verzenden wijzigingen zijn
// die daardoor overschreven zouden worden.
async function adoptBackgroundSnapshot() {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open(BG_CACHE_NAME);
    const res = await cache.match(BG_SNAPSHOT_REQUEST);
    if (!res) return false;
    const snapshot = await res.json();
    if (state.outbox.length > 0) return false;
    if (state.snapshot.syncedAt && new Date(snapshot.syncedAt) <= new Date(state.snapshot.syncedAt)) return false;
    state.snapshot = snapshot;
    persist();
    return true;
  } catch (err) {
    return false;
  }
}

// Wist alle lokale inhoud na het ontkoppelen van dit toestel -- voorkomt dat
// gegevens van de vorige koppeling (lijstjes, sjablonen, winkels, per-lijst-
// instellingen, volgorde) nog zichtbaar blijven, of dat een verouderde
// outbox alsnog naar HA gestuurd wordt na een nieuwe koppeling.
function clearAll() {
  state.snapshot = { lists: [], items: {}, syncedAt: null };
  state.outbox = [];
  state.templates = [];
  state.stores = [];
  state.listSettings = {};
  state.listOrder = [];
  state.itemStores = [];
  state.itemHistory = {};
  writeJSON(SNAPSHOT_KEY, state.snapshot);
  writeJSON(OUTBOX_KEY, state.outbox);
  writeJSON(TEMPLATES_KEY, state.templates);
  writeJSON(STORES_KEY, state.stores);
  writeJSON(LIST_SETTINGS_KEY, state.listSettings);
  writeJSON(LIST_ORDER_KEY, state.listOrder);
  writeJSON(ITEM_STORES_KEY, state.itemStores);
  writeJSON(ITEM_HISTORY_KEY, state.itemHistory);
}

export {
  getSnapshot,
  getStateSignature,
  getOutboxSize,
  getOutbox,
  hasContent,
  clearAll,
  addListLocal,
  renameListLocal,
  removeListLocal,
  getListOrder,
  setListOrderCache,
  getSortedLists,
  addItemLocal,
  updateItemLocal,
  removeItemLocal,
  clearCompletedLocal,
  moveItemLocal,
  applySyncResult,
  replaceSnapshot,
  adoptBackgroundSnapshot,
  getTemplates,
  setTemplatesCache,
  getStores,
  setStoresCache,
  getItemStoreMemory,
  setItemStoresCache,
  rememberItemStoreLocal,
  getItemSuggestions,
  getListSettings,
  setAllListSettingsCache,
  setListSettingsCache,
  findList,
  findItem,
};
