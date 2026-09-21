const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAccess, remoteIp } = require('./middleware');
const { createRateLimiter } = require('./rateLimit');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const syncRoutes = require('./routes/sync');
const pushRoutes = require('./routes/push');
const templatesRoutes = require('./routes/templates');
const storesRoutes = require('./routes/stores');
const listSettingsRoutes = require('./routes/listSettings');
const listOrderRoutes = require('./routes/listOrder');
const mealieRoutes = require('./routes/mealie');
const itemStoreMemoryRoutes = require('./routes/itemStoreMemory');
const itemHistoryRoutes = require('./routes/itemHistory');
const { startWatcher } = require('./watcher');
const { getRecentActorDeviceIds } = require('./recentActors');

const app = express();
const PORT = process.env.PORT || 3100;
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

// Geen 'trust proxy': niets in deze app leunt op req.ip/req.secure, en
// blind X-Forwarded-*-headers vertrouwen zou een aanvaller net zo makkelijk
// toestaan zich voor te doen als intern verkeer. Ingress-herkenning gebeurt
// in middleware.js op basis van het echte TCP-bronadres.
app.use(express.json());
app.use(cookieParser());

// Generieke bovengrens per gekoppeld toestel (of, vóór koppeling, per IP) op
// alle API-routes -- ruim boven wat normaal gebruik (sync-polling elke 15s,
// UI-acties) ooit nodig heeft, maar stopt een vastgelopen client of misbruik
// van de HA-doorgeefluik-routes.
const apiLimiter = createRateLimiter({
  windowMs: 10 * 1000,
  max: 60,
  keyFn: (req) => req.deviceId || remoteIp(req),
});

app.use('/api/auth', authRoutes);
app.use('/api/content', requireAccess, apiLimiter, contentRoutes);
app.use('/api/sync', requireAccess, apiLimiter, syncRoutes);
app.use('/api/push', requireAccess, apiLimiter, pushRoutes);
app.use('/api/templates', requireAccess, apiLimiter, templatesRoutes);
app.use('/api/stores', requireAccess, apiLimiter, storesRoutes);
app.use('/api/list-settings', requireAccess, apiLimiter, listSettingsRoutes);
app.use('/api/list-order', requireAccess, apiLimiter, listOrderRoutes);
app.use('/api/mealie', requireAccess, apiLimiter, mealieRoutes);
app.use('/api/item-stores', requireAccess, apiLimiter, itemStoreMemoryRoutes);
app.use('/api/item-history', requireAccess, apiLimiter, itemHistoryRoutes);

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
  'js/icons.js',
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
