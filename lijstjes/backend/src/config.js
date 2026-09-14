const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const PAIRING_FILE = path.join(DATA_DIR, 'pairing.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');

function isSupervised() {
  return !!process.env.SUPERVISOR_TOKEN;
}

function readPairingFile() {
  try {
    return JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
  } catch (err) {
    return null;
  }
}

function writePairingFile(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PAIRING_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// De credential die de SERVER zelf gebruikt om Home Assistant's Core API aan
// te spreken. Als add-on is dat altijd de door Supervisor uitgegeven token
// (volledig geprivilegieerd, geen configuratie nodig). Los van de add-on om
// (plain Docker) komt 'm uit env vars, of -- als die niet gezet zijn -- uit
// het token dat de gebruiker de allereerste keer via de pairing-pagina van de
// app zelf heeft ingevuld (zie routes/auth.js): dat ene Long-Lived Access
// Token is dan zowel de "inlog" als de operationele koppeling met HA, precies
// om geen apart account-systeem nodig te hebben.
function getOperatingCredential() {
  if (isSupervised()) {
    return { baseUrl: 'http://supervisor/core/api', token: process.env.SUPERVISOR_TOKEN };
  }
  const envUrl = process.env.HA_URL;
  const envToken = process.env.HA_TOKEN;
  if (envUrl && envToken) {
    return { baseUrl: `${envUrl.replace(/\/+$/, '')}/api`, token: envToken };
  }
  const stored = readPairingFile();
  if (stored && stored.ha_url && stored.ha_token) {
    return { baseUrl: `${stored.ha_url.replace(/\/+$/, '')}/api`, token: stored.ha_token };
  }
  return null;
}

function storeOperatingCredential(haUrl, token) {
  writePairingFile({ ha_url: haUrl, ha_token: token });
}

function hasOperatingCredential() {
  return !!getOperatingCredential();
}

function getSessionSecret() {
  try {
    return fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
  } catch (err) {
    const secret = require('crypto').randomBytes(32).toString('hex');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SESSION_SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

module.exports = {
  DATA_DIR,
  isSupervised,
  getOperatingCredential,
  storeOperatingCredential,
  hasOperatingCredential,
  getSessionSecret,
};
