const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { DATA_DIR } = require('./config');

const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

function loadOrCreateVapidKeys() {
  try {
    return JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  } catch (err) {
    const keys = webpush.generateVAPIDKeys();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 });
    return keys;
  }
}

const vapidKeys = loadOrCreateVapidKeys();
webpush.setVapidDetails('mailto:lijstjes@localhost', vapidKeys.publicKey, vapidKeys.privateKey);

function readSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeSubscriptions(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

function getPublicKey() {
  return vapidKeys.publicKey;
}

// Eén record per toestel (endpoint = uniek per browser-push-abonnement).
// deviceId is de sessie-cookie van dat toestel -- gebruikt om een toestel
// niet een melding te sturen over een wijziging die het net zelf gemaakt
// heeft (zie recentActors.js).
function addSubscription(deviceId, subscription) {
  const list = readSubscriptions().filter((s) => s.subscription.endpoint !== subscription.endpoint);
  list.push({ deviceId, subscription, createdAt: new Date().toISOString() });
  writeSubscriptions(list);
}

function removeSubscription(endpoint) {
  writeSubscriptions(readSubscriptions().filter((s) => s.subscription.endpoint !== endpoint));
}

async function sendNotificationToAll(payload, excludeDeviceIds = new Set()) {
  const list = readSubscriptions();
  if (!list.length) return;
  const body = JSON.stringify(payload);
  const stale = [];

  await Promise.all(
    list
      .filter((s) => !excludeDeviceIds.has(s.deviceId))
      .map(async (s) => {
        try {
          await webpush.sendNotification(s.subscription, body);
        } catch (err) {
          // 404/410 = het abonnement bestaat niet meer aan browserzijde
          // (app verwijderd, toestel losgekoppeld). 401/403 = de VAPID-sleutel
          // waarmee dit abonnement ooit is aangemaakt klopt niet meer (bv.
          // /data/vapid.json is op enig moment vervangen/gewist) -- net zo
          // permanent kapot, blijft anders elke poll opnieuw (en zonder
          // succes) geprobeerd worden. In beide gevallen opruimen.
          if ([401, 403, 404, 410].includes(err.statusCode)) {
            stale.push(s.subscription.endpoint);
          } else {
            console.error(`Pushmelding mislukt (${err.statusCode ?? 'onbekende status'}):`, err.message);
          }
        }
      })
  );

  if (stale.length) {
    writeSubscriptions(readSubscriptions().filter((s) => !stale.includes(s.subscription.endpoint)));
  }
}

module.exports = { getPublicKey, addSubscription, removeSubscription, sendNotificationToAll };
