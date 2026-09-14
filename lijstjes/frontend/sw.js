// App-shell caching: maakt de app (niet de data) volledig offline
// beschikbaar. /api/* wordt bewust nooit gecachet in de fetch-handler --
// de app-eigen localStorage-laag (js/storage.js) regelt offline data en
// synchronisatie. Voor echte achtergrondverversing (zie hieronder bij
// "push") gebruiken we een apart datacache: een service worker heeft geen
// toegang tot localStorage (dat bestaat alleen in een paginacontext), de
// Cache API is wel vanuit beide bereikbaar.
const CACHE_NAME = 'lijstjes-shell-v1';
const DATA_CACHE_NAME = 'lijstjes-data-v1';
const SNAPSHOT_REQUEST = new Request('/__offline-snapshot__');
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/storage.js',
  './js/sync.js',
  './js/push.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, DATA_CACHE_NAME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Pushmeldingen komen ook binnen terwijl de app niet open staat -- de
// backend stuurt deze zodra 'ie een wijziging in Home Assistant detecteert
// die niet via dit toestel zelf gemaakt is (zie backend/src/watcher.js).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {};
  }
  const title = data.title || 'Lijstjes';
  const options = {
    body: data.body || 'Er is iets gewijzigd.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { entityId: data.entityId },
  };
  // Elke pushmelding is ook het enige moment waarop deze service worker mag
  // draaien terwijl de app zelf niet open staat -- dus dit is meteen de kans
  // om de offline-snapshot te verversen, zodat de app bij het volgende
  // openen (ook zonder netwerk, bv. in een winkel zonder bereik) meteen de
  // actuele lijst toont in plaats van de staat van de laatste keer dat de
  // app open stond.
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), refreshOfflineSnapshot()]));
});

async function refreshOfflineSnapshot() {
  try {
    const res = await fetch('/api/content', { credentials: 'same-origin' });
    if (!res.ok) return;
    const cache = await caches.open(DATA_CACHE_NAME);
    await cache.put(SNAPSHOT_REQUEST, res.clone());

    // Staat de app toch al open (bv. op de achtergrondtab van een ander
    // toestel), laat 'm dat dan meteen weten in plaats van te wachten op de
    // volgende poll.
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      client.postMessage({ type: 'snapshot-updated' });
    }
  } catch (err) {
    // Geen netwerk of Home Assistant niet bereikbaar op dit moment -- geen
    // probleem, de eerstvolgende pushmelding probeert het opnieuw.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const entityId = event.notification.data?.entityId;
  const url = entityId ? `./#/list/${encodeURIComponent(entityId)}` : './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return; // altijd naar het netwerk, nooit cachen
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
