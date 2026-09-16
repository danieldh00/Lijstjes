// Mini-server die de echte /sw.js-route nabootst (versie-placeholder +
// no-store), zodat een deploy te simuleren is door VERSION te wijzigen.
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'lijstjes', 'frontend');
const state = { version: 'versie-een', cssMarker: 'EEN', swHits: 0 };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);

  if (p === '/__setversion') {
    state.version = url.searchParams.get('v');
    state.cssMarker = url.searchParams.get('css');
    res.writeHead(200).end('ok');
    return;
  }

  if (p === '/__swhits') {
    res.writeHead(200).end(String(state.swHits));
    return;
  }

  if (p === '/sw.js') {
    state.swHits++;
    const tpl = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    res.writeHead(200, {
      'Content-Type': TYPES['.js'],
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    });
    res.end(tpl.replaceAll('__CACHE_VERSION__', state.version));
    return;
  }

  if (p.startsWith('/api/')) {
    const lists = [{ entity_id: 'todo.a', name: 'Boodschappen' }];
    const items = { 'todo.a': [{ uid: 'u1', summary: 'Melk', status: 'needs_action' }] };
    const body = p.includes('auth/status')
      ? { paired: true, viaIngress: true }
      : p.includes('content')
        ? { lists, items, syncedAt: new Date().toISOString() }
        : p.includes('list-order')
          ? { order: ['todo.a'] }
          : p.includes('templates')
            ? { templates: [] }
            : p.includes('stores')
              ? { stores: [] }
              : p.includes('sync')
                ? { results: [], snapshot: { lists, items, syncedAt: new Date().toISOString() } }
                : {};
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return;
  }

  if (p === '/') p = '/index.html';
  const file = path.join(DIR, p);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('nope');
    return;
  }

  let body = fs.readFileSync(file);
  // De CSS krijgt een marker mee, zodat te meten is wélke versie van een
  // shell-bestand de pagina daadwerkelijk gebruikt.
  if (p === '/css/style.css') {
    body = Buffer.concat([body, Buffer.from(`\n:root{--test-marker:"${state.cssMarker}";}\n`)]);
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=0',
  });
  res.end(body);
});

// Wordt door pwa-update.js gestart en weer gesloten; die test heeft een eigen
// server nodig omdat sw.js daar tussendoor van versie moet kunnen wisselen.
module.exports = { start: () => server.listen(8799) };
