const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'item-history.json');

// Onthoudt per lijst welke itemnamen ooit zijn toegevoegd (met hoeveel keer
// en wanneer voor het laatst), gedeeld tussen alle gebruikers van deze
// add-on -- zodat de voorspellende suggesties (zie getItemSuggestions in
// frontend/js/storage.js) ook meetellen voor items die een ándere gebruiker
// ooit heeft getypt, niet alleen wat op dit ene toestel is bijgehouden. Net
// als item-store-memory.js een puur app-eigen concept, niets van Home
// Assistant.

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

// Zelfde ophaalpatroon als item-store-memory.js: zonder entityId alles in
// één keer, met entityId alleen die lijst.
function listItemHistory(entityId) {
  const all = readAll();
  return entityId ? all.filter((e) => e.entity_id === entityId) : all;
}

function bumpItemHistory(entityId, summary) {
  const text = String(summary || '').trim();
  const itemKey = normalize(text);
  if (!itemKey) return;
  const all = readAll();
  const idx = all.findIndex((e) => e.entity_id === entityId && e.itemKey === itemKey);
  if (idx === -1) {
    all.push({ entity_id: entityId, itemKey, summary: text, count: 1, lastUsed: Date.now() });
  } else {
    const entry = all[idx];
    all[idx] = { ...entry, summary: text, count: entry.count + 1, lastUsed: Date.now() };
  }
  writeAll(all);
}

module.exports = { listItemHistory, bumpItemHistory };
