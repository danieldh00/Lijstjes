const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'item-store-memory.json');

// Onthoudt per lijst welke winkel bij een itemnaam hoort ("Melk" -> "Albert
// Heijn"), zodat je die niet elke keer opnieuw hoeft te kiezen als je een
// terugkerend boodschappenlijstje-item weer toevoegt. Net als stores.js en
// templates.js een puur app-eigen concept, niets van Home Assistant -- de
// koppeling van een concreet, huidig item aan een winkel staat wél gewoon in
// HA (zie STORE_PREFIX in frontend/js/app.js); dit is alleen het "geleerde"
// standaardje voor de vólgende keer dat je diezelfde naam typt, ook nadat
// het oude item allang afgevinkt en opgeruimd is.

function normalize(name) {
  return String(name || '').trim().toLowerCase();
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeAll(entries) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2), { mode: 0o600 });
}

// Zelfde ophaalpatroon als stores.js/templates.js: zonder entityId alles in
// één keer (de frontend haalt dit één keer voor alle lijstjes op en filtert
// zelf per lijst), met entityId alleen die lijst.
function listItemStores(entityId) {
  const all = readAll();
  return entityId ? all.filter((e) => e.entity_id === entityId) : all;
}

function rememberItemStore(entityId, itemName, store) {
  const itemKey = normalize(itemName);
  if (!itemKey || !store) return;
  const all = readAll();
  const idx = all.findIndex((e) => e.entity_id === entityId && e.itemKey === itemKey);
  const entry = { entity_id: entityId, itemKey, store, updatedAt: new Date().toISOString() };
  if (idx === -1) all.push(entry);
  else all[idx] = entry;
  writeAll(all);
}

module.exports = { listItemStores, rememberItemStore };
