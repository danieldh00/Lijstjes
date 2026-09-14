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

function summarize(change) {
  const parts = [];
  if (change.added) parts.push(`${change.added} toegevoegd`);
  if (change.completed) parts.push(`${change.completed} afgevinkt`);
  if (change.reopened) parts.push(`${change.reopened} heropend`);
  if (change.removed) parts.push(`${change.removed} verwijderd`);
  if (change.edited) parts.push(`${change.edited} gewijzigd`);
  return parts.join(', ');
}

async function poll(getRecentActorDeviceIds) {
  if (!hasOperatingCredential()) return;
  try {
    const snapshot = await buildSnapshot();
    if (lastKnown) {
      const changes = diffLists(lastKnown, snapshot);
      const excluded = getRecentActorDeviceIds();
      for (const change of changes) {
        await sendNotificationToAll(
          { title: change.name, body: summarize(change), entityId: change.entity_id },
          excluded
        );
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
