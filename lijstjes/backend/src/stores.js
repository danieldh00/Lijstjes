const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./config');

const STORES_FILE = path.join(DATA_DIR, 'stores.json');

// Winkels ("waar moet dit gehaald worden") zijn, net als sjablonen, een
// puur app-eigen concept -- Home Assistant's todo-domein kent zoiets niet.
// De koppeling van een item aan een winkel zelf staat wél in HA (gecodeerd
// in het description-veld van het item, zie frontend/js/app.js), maar de
// lijst van beschikbare winkels per lijstje leeft alleen hier.

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(STORES_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeAll(stores) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2), { mode: 0o600 });
}

function listStores(entityId) {
  const all = readAll();
  return entityId ? all.filter((s) => s.entity_id === entityId) : all;
}

function createStore({ name, entity_id }) {
  const store = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    entity_id,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(store);
  writeAll(all);
  return store;
}

function deleteStore(id) {
  const all = readAll();
  const next = all.filter((s) => s.id !== id);
  writeAll(next);
  return next.length !== all.length;
}

module.exports = { listStores, createStore, deleteStore };
