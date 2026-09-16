const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const REVOKED_FILE = path.join(DATA_DIR, 'revoked-sessions.json');
// Alleen expliciete "ontkoppel dit toestel"-acties belanden hier (geen
// automatisch groeiende log) -- een harde bovengrens is puur een
// veiligheidsklep tegen ongebounded groei van het bestand.
const MAX_REVOKED = 500;

function load() {
  try {
    return new Set(JSON.parse(fs.readFileSync(REVOKED_FILE, 'utf8')));
  } catch (err) {
    return new Set();
  }
}

// In-memory Set, één keer bij module-load ingelezen -- verify() draait op
// elk API-verzoek, dus een schijf-lezing per aanroep is onnodige overhead
// voor een bestand dat alleen bij een unpair-actie wijzigt.
const revoked = load();

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REVOKED_FILE, JSON.stringify([...revoked]), { mode: 0o600 });
}

function isRevoked(token) {
  return revoked.has(token);
}

function revoke(token) {
  if (!token) return;
  revoked.add(token);
  if (revoked.size > MAX_REVOKED) {
    revoked.delete(revoked.values().next().value);
  }
  persist();
}

module.exports = { isRevoked, revoke };
