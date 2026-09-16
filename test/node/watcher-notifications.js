// Test de samenvoeg-logica van watcher.js door zijn afhankelijkheden te mocken.
const Module = require('module');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'lijstjes', 'backend', 'src');

let snapshotQueue = [];
const sent = [];

const origResolve = Module._resolveFilename;
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename && parent.filename.endsWith('watcher.js')) {
    if (request === './ha/snapshot') return { buildSnapshot: async () => snapshotQueue.shift() };
    if (request === './push') return { sendNotificationToAll: async (p) => sent.push(p) };
    if (request === './config') return { hasOperatingCredential: () => true };
  }
  return origLoad.apply(this, arguments);
};

const watcherPath = path.join(SRC, 'watcher.js');
delete require.cache[watcherPath];
const watcher = require(watcherPath);

// startWatcher start een interval; we willen poll() los aanroepen. Die is niet
// geëxporteerd, dus we sturen de tijd: startWatcher() doet één directe poll.
// In plaats daarvan gebruiken we fake timers via een eigen aanroep-lus.
const realSetInterval = global.setInterval;
global.setInterval = () => 0; // geen echte timer tijdens de test

function list(name, entityId, items) {
  return { entity_id: entityId, name, items };
}
function snap(lists) {
  return {
    lists: lists.map((l) => ({ entity_id: l.entity_id, name: l.name })),
    items: Object.fromEntries(lists.map((l) => [l.entity_id, l.items])),
    syncedAt: new Date().toISOString(),
  };
}
function items(n, startIdx = 0) {
  return Array.from({ length: n }, (_, i) => ({
    uid: `u${startIdx + i}`,
    summary: `item ${startIdx + i}`,
    status: 'needs_action',
  }));
}

async function run(scenario, snapshots) {
  sent.length = 0;
  snapshotQueue = snapshots.slice();
  // module-state resetten door opnieuw te laden
  delete require.cache[watcherPath];
  const w = require(watcherPath);
  // startWatcher doet de eerste poll (basislijn) en registreert het interval
  w.startWatcher(() => new Set());
  // wacht tot alle polls afgehandeld zijn
  for (let i = 0; i < snapshots.length + 2; i++) await new Promise((r) => setImmediate(r));
  // handmatig de resterende polls draaien via de geëxporteerde interval-callback
  return sent.slice();
}

(async () => {
  // Omdat poll() niet geëxporteerd is, testen we via startWatcher + het
  // interval dat we onderscheppen.
  let intervalCb = null;
  global.setInterval = (cb) => {
    intervalCb = cb;
    return 0;
  };

  async function scenario(name, snapshots, expected) {
    sent.length = 0;
    snapshotQueue = snapshots.slice();
    delete require.cache[watcherPath];
    const w = require(watcherPath);
    w.startWatcher(() => new Set());
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    for (let i = 1; i < snapshots.length; i++) {
      intervalCb();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    }
    const bodies = sent.map((s) => `${s.title}: ${s.body}`);
    const ok = JSON.stringify(bodies) === JSON.stringify(expected);
    console.log(ok ? 'PASS' : 'FAIL', '-', name);
    console.log('   meldingen:', JSON.stringify(bodies));
    if (!ok) console.log('   verwacht :', JSON.stringify(expected));
  }

  // 1: losse wijziging -> precies 1 melding, meteen
  await scenario(
    'losse wijziging: 1 melding',
    [
      snap([list('Boodschappen', 'todo.a', items(2))]),
      snap([list('Boodschappen', 'todo.a', items(3))]),
      snap([list('Boodschappen', 'todo.a', items(3))]),
    ],
    ['Boodschappen: 1 toegevoegd']
  );

  // 2: hele lijst vullen over meerdere polls -> 1e melding + eindtotaal
  await scenario(
    'reeks over 4 polls: eerste melding + eindtotaal',
    [
      snap([list('Boodschappen', 'todo.a', items(0))]),
      snap([list('Boodschappen', 'todo.a', items(5))]),
      snap([list('Boodschappen', 'todo.a', items(13))]),
      snap([list('Boodschappen', 'todo.a', items(20))]),
      snap([list('Boodschappen', 'todo.a', items(20))]),
      snap([list('Boodschappen', 'todo.a', items(20))]),
    ],
    ['Boodschappen: 5 toegevoegd', 'Boodschappen: 20 toegevoegd']
  );

  // 3: geen wijzigingen -> geen meldingen
  await scenario(
    'niets gewijzigd: geen meldingen',
    [
      snap([list('Boodschappen', 'todo.a', items(3))]),
      snap([list('Boodschappen', 'todo.a', items(3))]),
      snap([list('Boodschappen', 'todo.a', items(3))]),
    ],
    []
  );
})();
