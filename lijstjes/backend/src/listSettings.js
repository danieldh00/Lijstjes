const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const { listTemplates } = require('./templates');
const { listStores } = require('./stores');

const SETTINGS_FILE = path.join(DATA_DIR, 'list-settings.json');

// Welke lijstjes "Sjablonen", "Winkels" en "Maaltijden" laten zien -- niet elk
// lijstje (bv. Klussen) heeft daar iets aan, dus dit staat per lijst aan/uit.

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function writeAll(settings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

// Zonder expliciet ingestelde voorkeur: automatisch aan als er al
// sjablonen/winkels voor deze lijst bestaan (zodat bestaand gebruik niet
// ineens verstopt raakt), anders uit.
function resolve(entityId, explicit) {
  if (explicit) {
    return {
      templatesEnabled: !!explicit.templatesEnabled,
      storesEnabled: !!explicit.storesEnabled,
      mealsEnabled: !!explicit.mealsEnabled,
    };
  }
  return {
    templatesEnabled: listTemplates(entityId).length > 0,
    storesEnabled: listStores(entityId).length > 0,
    // Maaltijden is nieuw en heeft geen bestaande gegevens om op terug te
    // vallen, dus die staat standaard uit tot je 'm zelf aanzet.
    mealsEnabled: false,
  };
}

function getSettings(entityId) {
  const all = readAll();
  return resolve(entityId, all[entityId]);
}

function getAllSettings() {
  const all = readAll();
  const entityIds = new Set([
    ...Object.keys(all),
    ...listTemplates().map((t) => t.entity_id),
    ...listStores().map((s) => s.entity_id),
  ]);
  const result = {};
  for (const entityId of entityIds) {
    result[entityId] = resolve(entityId, all[entityId]);
  }
  return result;
}

function setSettings(entityId, { templatesEnabled, storesEnabled, mealsEnabled }) {
  const all = readAll();
  all[entityId] = {
    templatesEnabled: !!templatesEnabled,
    storesEnabled: !!storesEnabled,
    mealsEnabled: !!mealsEnabled,
  };
  writeAll(all);
  return all[entityId];
}

module.exports = { getSettings, getAllSettings, setSettings };
