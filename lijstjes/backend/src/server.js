const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAccess } = require('./middleware');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const syncRoutes = require('./routes/sync');
const pushRoutes = require('./routes/push');
const templatesRoutes = require('./routes/templates');
const storesRoutes = require('./routes/stores');
const listSettingsRoutes = require('./routes/listSettings');
const { startWatcher } = require('./watcher');
const { getRecentActorDeviceIds } = require('./recentActors');

const app = express();
const PORT = process.env.PORT || 3100;
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

app.set('trust proxy', true);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/content', requireAccess, contentRoutes);
app.use('/api/sync', requireAccess, syncRoutes);
app.use('/api/push', requireAccess, pushRoutes);
app.use('/api/templates', requireAccess, templatesRoutes);
app.use('/api/stores', requireAccess, storesRoutes);
app.use('/api/list-settings', requireAccess, listSettingsRoutes);

// Hashing de app-shell-bestanden bij het opstarten geeft de service worker
// een automatisch, aan de inhoud gekoppeld cache-versienummer -- zo dwingt
// elke deploy die de app wijzigt een al geïnstalleerde PWA om verse
// bestanden op te halen, zonder dat iemand een versienummer met de hand
// moet ophogen (de bug die gebruikers op een oude versie liet hangen totdat
// ze zelf hun browsercache leegden).
const APP_SHELL_FILES = [
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/api.js',
  'js/storage.js',
  'js/sync.js',
  'js/push.js',
  'manifest.webmanifest',
];
function computeAppVersion() {
  const hash = crypto.createHash('sha256');
  for (const file of APP_SHELL_FILES) hash.update(fs.readFileSync(path.join(FRONTEND_DIR, file)));
  return hash.digest('hex').slice(0, 12);
}
const APP_VERSION = computeAppVersion();

// Dynamisch geserveerd (vóór express.static hieronder) zodat de cachenaam
// erin vervangen kan worden per deploy, en zodat het script zelf nooit door
// de browser's eigen HTTP-cache gecachet wordt -- beide zijn nodig om de
// browser betrouwbaar een nieuwe versie te laten opmerken en toepassen.
app.get('/sw.js', (req, res) => {
  const template = fs.readFileSync(path.join(FRONTEND_DIR, 'sw.js'), 'utf8');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Service-Worker-Allowed', '/');
  res.send(template.replaceAll('__CACHE_VERSION__', APP_VERSION));
});

app.use(express.static(FRONTEND_DIR));

// SPA-fallback voor alles buiten /api: het frontend-JS bepaalt zelf de view.
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.code === 'HA_NOT_CONFIGURED' ? 409 : err.status && err.status < 500 ? err.status : 500;
  console.error(err);
  res.status(status).json({ error: err.code || 'internal_error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`Lijstjes luistert op poort ${PORT}`);
  startWatcher(getRecentActorDeviceIds);
});
