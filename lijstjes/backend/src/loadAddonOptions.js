const fs = require('fs');

// Leest /data/options.json wanneer als HA add-on gedraaid (Supervisor schrijft
// dit bestand op basis van het Configuration-tabblad). Buiten de add-on om
// (plain Docker/lokaal) bestaat dit bestand niet en gebruiken we env vars.
function loadAddonOptions() {
  try {
    const raw = fs.readFileSync('/data/options.json', 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

module.exports = { loadAddonOptions };
