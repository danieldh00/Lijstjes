const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./config');

const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

// Sjablonen (bv. "Pasta-avond" -> spaghetti, gehakt, ui) zijn een puur
// app-eigen concept -- Home Assistant's todo-domein kent zoiets niet, dus
// dit leeft alleen in de eigen opslag van de add-on, niet in HA.

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeAll(templates) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), { mode: 0o600 });
}

function listTemplates(entityId) {
  const all = readAll();
  return entityId ? all.filter((t) => t.entity_id === entityId) : all;
}

function createTemplate({ name, entity_id, items }) {
  const template = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    entity_id,
    items: items.map((i) => String(i).trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(template);
  writeAll(all);
  return template;
}

function deleteTemplate(id) {
  const all = readAll();
  const next = all.filter((t) => t.id !== id);
  writeAll(next);
  return next.length !== all.length;
}

module.exports = { listTemplates, createTemplate, deleteTemplate };
