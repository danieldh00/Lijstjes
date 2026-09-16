const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAccess, remoteIp } = require('./middleware');
const { createRateLimiter } = require('./rateLimit');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const syncRoutes = require('./routes/sync');
const pushRoutes = require('./routes/push');
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
