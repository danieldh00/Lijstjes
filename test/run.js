// Draait alle regressietests. De browsertests praten met een statische server
// op poort 8791 die frontend/ serveert; de API's worden in de pagina zelf
// gemockt (window.fetch), dus er is geen backend en geen Home Assistant nodig.
//
//   node test/run.js            alles
//   node test/run.js mealie     alleen tests met "mealie" in de naam
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'lijstjes', 'frontend');
const PORT = 8791;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serveFrontend() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/') p = '/index.html';
    const file = path.join(FRONTEND, p);
    if (!file.startsWith(FRONTEND) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end('niet gevonden');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], {
      stdio: 'inherit',
      // playwright staat globaal geïnstalleerd in deze omgeving
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' },
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

(async () => {
  const filter = process.argv[2];
  const tests = [];
  for (const soort of ['node', 'browser']) {
    const dir = path.join(__dirname, soort);
    for (const naam of fs.readdirSync(dir).sort()) {
      if (!naam.endsWith('.js') || naam.endsWith('-server.js')) continue;
      if (filter && !naam.includes(filter)) continue;
      tests.push({ naam: `${soort}/${naam}`, pad: path.join(dir, naam) });
    }
  }

  const server = await serveFrontend();
  let mislukt = 0;

  for (const test of tests) {
    console.log(`\n[1m=== ${test.naam} ===[0m`);
    if (!(await run(test.pad))) {
      mislukt++;
      console.log(`[31mFOUT in ${test.naam}[0m`);
    }
  }

  server.close();
  console.log(
    `\n${tests.length} test(s) gedraaid, ${mislukt ? `[31m${mislukt} mislukt[0m` : '[32mgeen fouten[0m'}`
  );
  console.log('Let op: deze tests loggen hun bevindingen; lees de uitvoer, een exit-code 0 zegt niet alles.');
  process.exit(mislukt ? 1 : 0);
})();
