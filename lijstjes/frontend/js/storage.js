// Lokale, offline-first opslag: één "workingState" (lijstjes + items) dat
// direct gerenderd wordt, plus een "outbox" van nog niet naar Home Assistant
// gestuurde wijzigingen. Alles staat in localStorage zodat de app na het
// sluiten en heropenen (ook zonder netwerk) meteen weer bruikbaar is.

const SNAPSHOT_KEY = 'lijstjes:snapshot';
const OUTBOX_KEY = 'lijstjes:outbox';
const TEMPLATES_KEY = 'lijstjes:templates';
const STORES_KEY = 'lijstjes:stores';

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
};

function persist() {
  writeJSON(SNAPSHOT_KEY, state.snapshot);
  writeJSON(OUTBOX_KEY, state.outbox);
}

function getSnapshot() {
  return state.snapshot;
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
  const flushedIds = new Set();
  const idRemap = { lists: new Map(), items: new Map() };

  for (const result of results) {
    flushedIds.add(result.clientMutationId);
    const mutation = state.outbox.find((m) => m.clientMutationId === result.clientMutationId);
    if (!result.ok || !mutation) continue;

    if (mutation.type === 'create_list' && result.entity_id) {
      idRemap.lists.set(mutation.tempListId, result.entity_id);
    }
    if (mutation.type === 'add_item' && result.uid && mutation.clientItemId) {
      idRemap.items.set(mutation.clientItemId, result.uid);
    }
  }

  // Nog niet verzonden mutaties blijven staan; de items/lijsten die ze
  // raken laten we ongemoeid bij het overnemen van de servertoestand, zodat
  // heel recente lokale wijzigingen niet verdwijnen.
  state.outbox = state.outbox.filter((m) => !flushedIds.has(m.clientMutationId));
  const stillPendingEntityIds = new Set(state.outbox.map((m) => m.entity_id || m.tempListId));

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
    const pendingLocalItems = items.filter((i) => i.uid.startsWith('local:'));
    if (pendingLocalItems.length && nextItems[entityId]) {
      nextItems[entityId] = nextItems[entityId].concat(pendingLocalItems);
    }
  }

  state.snapshot = { ...serverSnapshot, lists: nextLists, items: nextItems };
  persist();
}

// Zuivere pull (geen openstaande outbox): servertoestand is meteen leidend.
function replaceSnapshot(serverSnapshot) {
  state.snapshot = serverSnapshot;
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

export {
  getSnapshot,
  getOutboxSize,
  getOutbox,
  hasContent,
  addListLocal,
  addItemLocal,
  updateItemLocal,
  removeItemLocal,
  moveItemLocal,
  applySyncResult,
  replaceSnapshot,
  adoptBackgroundSnapshot,
  getTemplates,
  setTemplatesCache,
  getStores,
  setStoresCache,
  findList,
  findItem,
};
