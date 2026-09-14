// App-shell caching: maakt de app (niet de data) volledig offline
// beschikbaar. /api/* wordt bewust nooit gecachet in de fetch-handler --
// de app-eigen localStorage-laag (js/storage.js) regelt offline data en
// synchronisatie. Voor echte achtergrondverversing (zie hieronder bij
// "push") gebruiken we een apart datacache: een service worker heeft geen
// toegang tot localStorage (dat bestaat alleen in een paginacontext), de
// Cache API is wel vanuit beide bereikbaar.
// __CACHE_VERSION__ wordt door de server vervangen (zie server.js) door een
// hash van de app-shell-bestanden, zodat de cachenaam -- en daarmee de
// identiteit van deze hele service worker voor de browser -- automatisch
// verandert bij elke deploy die de app wijzigt, zonder dat iemand een
// versienummer met de hand moet ophogen. Was tot nu toe een vast
// 'lijstjes-shell-v1': de browser detecteerde een nieuwe sw.js dan alleen
// als sw.js zélf toevallig ook wijzigde, waardoor updates aan alleen
// app.js/storage.js/css soms niet (op tijd) doorkwamen op een al
// geïnstalleerd toestel.
const CACHE_NAME = 'lijstjes-shell-__CACHE_VERSION__';
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
    // Eén melding per lijstje: een volgende melding over hetzelfde lijstje
    // vervangt de vorige in plaats van er een nieuwe naast te zetten. Met
    // renotify uit gebeurt dat stil, zonder opnieuw te trillen/piepen.
    tag: data.entityId || 'lijstjes',
    renotify: false,
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
  const { request } = event;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') {
    return; // altijd naar het netwerk, nooit cachen
  }
  if (url.pathname === '/sw.js') {
    return; // nooit zelf onderscheppen -- de browser moet dit bestand altijd rechtstreeks kunnen ophalen om een update te herkennen
  }

  if (request.mode === 'navigate') {
    // Voor het laden van de pagina zelf: netwerk-eerst, zodat een sessie die
    // online is altijd de nieuwste HTML/routering ziet in plaats van de
    // laatst gecachete versie. Alleen bij een mislukte netwerkpoging (echt
    // offline) valt dit terug op de gecachete shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // stale-while-revalidate voor de overige app-shell-bestanden (css/js/
  // iconen): meteen uit cache antwoorden (blijft snel en volledig offline
  // bruikbaar), en op de achtergrond opnieuw ophalen om de cache voor de
  // volgende keer bij te werken. Samen met de automatisch opgehoogde
  // CACHE_NAME hierboven is dit wat voorkomt dat een al geïnstalleerde PWA
  // na een deploy op verouderde CSS/JS blijft hangen, zonder dat iemand
  // zelf de browsercache hoeft te legen.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
