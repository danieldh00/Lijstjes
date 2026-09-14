// Onthoudt welk toestel (deviceId = sessie-cookie) recent zelf een mutatie
// via /api/sync heeft doorgevoerd, zodat de achtergrond-watcher (watcher.js)
// dat toestel geen pushmelding stuurt over de wijziging die het net zelf
// heeft gemaakt -- de app op dat toestel toont de wijziging immers al
// optimistisch. Een korte TTL (iets langer dan het poll-interval van de
// watcher) is voldoende; geen persistentie nodig.
const TTL_MS = 25000;
const recent = new Map();

function markActor(deviceId) {
  if (!deviceId) return;
  recent.set(deviceId, Date.now());
}

function getRecentActorDeviceIds() {
  const now = Date.now();
  const ids = new Set();
  for (const [id, ts] of recent) {
    if (now - ts < TTL_MS) {
      ids.add(id);
    } else {
      recent.delete(id);
    }
  }
  return ids;
}

module.exports = { markActor, getRecentActorDeviceIds };
