const WebSocket = require('ws');
const { buildSnapshot } = require('./ha/snapshot');
const { sendNotificationToAll } = require('./push');
const { getOperatingCredential, hasOperatingCredential } = require('./config');

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

// Kern van de achtergrondcontrole: haalt de huidige toestand op, vergelijkt
// 'm met de vorige bekende toestand en stuurt pushmeldingen voor wat er
// veranderd is. Wordt zowel door de vaste polling-lus als (als latency-
// optimalisatie) door de WebSocket-trigger hieronder aangeroepen -- veilig
// om vaker dan nodig aan te roepen, want zonder verschil worden er gewoon
// geen meldingen verstuurd.
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
// een browsertabblad open staat. Dit is en blijft het primaire mechanisme:
// de WebSocket-verbinding hieronder is puur een latency-optimalisatie
// (near-instant i.p.v. tot 20s vertraging) die er bovenop komt, nooit een
// vervanging -- als die verbinding om wat voor reden dan ook nooit lukt
// (oudere HA-versie, netwerkbeperking, onverwachte proxy-eigenaardigheid),
// verandert er niets aan het bestaande, bewezen gedrag.
function startPolling(getRecentActorDeviceIds) {
  poll(getRecentActorDeviceIds);
  setInterval(() => poll(getRecentActorDeviceIds), POLL_INTERVAL_MS);
}

// ---------- WebSocket-latency-optimalisatie ----------

const WS_RECONNECT_BASE_MS = 2000;
const WS_RECONNECT_MAX_MS = 60000;
const EARLY_POLL_DEBOUNCE_MS = 800;

let wsReconnectAttempt = 0;
let earlyPollTimer = null;

function wsUrlFor(baseUrl) {
  // cred.baseUrl eindigt altijd op '/api' (zie config.js, zowel in
  // Supervisor- als standalone-modus) -- HA's WebSocket-API zit op hetzelfde
  // pad plus '/websocket', met ws(s) i.p.v. http(s) als schema.
  return `${baseUrl}/websocket`.replace(/^http/, 'ws');
}

function scheduleEarlyPoll(getRecentActorDeviceIds) {
  clearTimeout(earlyPollTimer);
  earlyPollTimer = setTimeout(() => poll(getRecentActorDeviceIds), EARLY_POLL_DEBOUNCE_MS);
}

function scheduleReconnect(getRecentActorDeviceIds) {
  wsReconnectAttempt += 1;
  const delay = Math.min(WS_RECONNECT_BASE_MS * 2 ** Math.min(wsReconnectAttempt, 5), WS_RECONNECT_MAX_MS);
  setTimeout(() => connectWebSocket(getRecentActorDeviceIds), delay);
}

function connectWebSocket(getRecentActorDeviceIds) {
  const cred = getOperatingCredential();
  if (!cred) {
    // Nog niet gekoppeld (standalone-modus vóór pairing) -- gewoon later
    // opnieuw proberen, de reguliere polling-lus doet in de tussentijd niets
    // omdat hasOperatingCredential() ook false is.
    scheduleReconnect(getRecentActorDeviceIds);
    return;
  }

  let socket;
  try {
    socket = new WebSocket(wsUrlFor(cred.baseUrl));
  } catch (err) {
    scheduleReconnect(getRecentActorDeviceIds);
    return;
  }

  let subscribed = false;
  let msgId = 1;
  let subscriptionId = null;

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }

    switch (msg.type) {
      case 'auth_required':
        socket.send(JSON.stringify({ type: 'auth', access_token: cred.token }));
        break;
      case 'auth_invalid':
        console.error('Lijstjes: WebSocket-authenticatie bij Home Assistant afgewezen, val terug op polling.');
        socket.close();
        break;
      case 'auth_ok':
        wsReconnectAttempt = 0;
        subscriptionId = msgId++;
        socket.send(JSON.stringify({ id: subscriptionId, type: 'subscribe_events', event_type: 'state_changed' }));
        break;
      case 'result':
        if (msg.id === subscriptionId && msg.success) subscribed = true;
        break;
      case 'event': {
        const entityId = msg.event?.data?.entity_id;
        if (subscribed && typeof entityId === 'string' && entityId.startsWith('todo.')) {
          scheduleEarlyPoll(getRecentActorDeviceIds);
        }
        break;
      }
      default:
        break;
    }
  });

  socket.on('error', (err) => {
    console.error('Lijstjes: WebSocket-verbinding met Home Assistant mislukt:', err.message);
  });

  socket.on('close', () => {
    scheduleReconnect(getRecentActorDeviceIds);
  });
}

function startWatcher(getRecentActorDeviceIds) {
  startPolling(getRecentActorDeviceIds);
  connectWebSocket(getRecentActorDeviceIds);
}

module.exports = { startWatcher };
