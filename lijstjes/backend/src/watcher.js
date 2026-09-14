const { buildSnapshot } = require('./ha/snapshot');
const { sendNotificationToAll } = require('./push');
const { hasOperatingCredential } = require('./config');

const POLL_INTERVAL_MS = 20000;

let lastKnown = null;

function diffLists(prevSnapshot, nextSnapshot) {
  const changes = [];
  for (const list of nextSnapshot.lists) {
    const prevItems = prevSnapshot.items[list.entity_id];
    if (!prevItems) continue; // nieuwe lijst sinds de vorige poll: geen melding, geen vergelijkingsbasis

    const nextItems = nextSnapshot.items[list.entity_id] || [];
    const prevMap = new Map(prevItems.map((i) => [i.uid, i]));
    const nextMap = new Map(nextItems.map((i) => [i.uid, i]));

    let added = 0;
    let removed = 0;
    let completed = 0;
    let reopened = 0;
    let edited = 0;

    for (const [uid, item] of nextMap) {
      const prev = prevMap.get(uid);
      if (!prev) {
        added += 1;
        continue;
      }
      if (prev.status !== item.status) {
        if (item.status === 'completed') completed += 1;
        else reopened += 1;
      } else if (
        prev.summary !== item.summary ||
        prev.description !== item.description ||
        prev.due_date !== item.due_date ||
        prev.due_datetime !== item.due_datetime
      ) {
        edited += 1;
      }
    }
    for (const uid of prevMap.keys()) {
      if (!nextMap.has(uid)) removed += 1;
    }

    if (added || removed || completed || reopened || edited) {
      changes.push({ entity_id: list.entity_id, name: list.name, added, removed, completed, reopened, edited });
    }
  }
  return changes;
}

function summarize(totals) {
  const parts = [];
  if (totals.added) parts.push(`${totals.added} toegevoegd`);
  if (totals.completed) parts.push(`${totals.completed} afgevinkt`);
  if (totals.reopened) parts.push(`${totals.reopened} heropend`);
  if (totals.removed) parts.push(`${totals.removed} verwijderd`);
  if (totals.edited) parts.push(`${totals.edited} gewijzigd`);
  return parts.join(', ');
}

// Een reeks wijzigingen die bij elkaar hoort (een heel lijstje in één keer
// vullen in de HA-app) levert anders bij élke poll opnieuw een melding op.
// Daarom houden we per lijst een lopende reeks bij: bij de eerste poll met
// wijzigingen gaat er meteen een melding uit (geen onnodige vertraging voor
// de veelvoorkomende losse wijziging), daarna wordt er alleen nog opgeteld
// totdat er een poll zonder wijzigingen langskomt -- dán gaat de eindstand er
// als totaal uit. Samen met de `tag` per lijst in de service worker vervangt
// die tweede melding de eerste, zodat je er altijd maar één in beeld hebt.
const bursts = new Map();
const COUNTERS = ['added', 'removed', 'completed', 'reopened', 'edited'];

async function poll(getRecentActorDeviceIds) {
  if (!hasOperatingCredential()) return;
  try {
    const snapshot = await buildSnapshot();
    if (lastKnown) {
      const changes = diffLists(lastKnown, snapshot);
      const excluded = getRecentActorDeviceIds();
      const changedNow = new Set(changes.map((c) => c.entity_id));

      for (const change of changes) {
        let burst = bursts.get(change.entity_id);
        if (!burst) {
          burst = { totals: Object.fromEntries(COUNTERS.map((k) => [k, 0])), sentSummary: null };
          bursts.set(change.entity_id, burst);
        }
        burst.name = change.name;
        for (const key of COUNTERS) burst.totals[key] += change[key];
      }

      for (const [entityId, burst] of bursts) {
        const summary = summarize(burst.totals);
        if (changedNow.has(entityId)) {
          // De reeks loopt nog; alleen de allereerste melding gaat nu uit.
          if (burst.sentSummary !== null) continue;
        } else if (summary === burst.sentSummary) {
          // Reeks afgelopen en de eindstand is al gemeld.
          bursts.delete(entityId);
          continue;
        }
        await sendNotificationToAll({ title: burst.name, body: summary, entityId }, excluded);
        burst.sentSummary = summary;
        if (!changedNow.has(entityId)) bursts.delete(entityId);
      }
    }
    lastKnown = snapshot;
  } catch (err) {
    console.error('Achtergrondcontrole van Home Assistant mislukt:', err.message);
  }
}

// Draait continu zolang de add-on/server draait -- onafhankelijk van of er
// een browsertabblad open staat. Zo komt een wijziging die rechtstreeks in
// Home Assistant (dashboard, Assist, automatisering) gemaakt wordt ook als
// pushmelding aan op andere toestellen, zonder dat iemand de app hoeft te
// openen.
function startWatcher(getRecentActorDeviceIds) {
  poll(getRecentActorDeviceIds);
  setInterval(() => poll(getRecentActorDeviceIds), POLL_INTERVAL_MS);
}

module.exports = { startWatcher };
