const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { requireAccess } = require('./middleware');
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const syncRoutes = require('./routes/sync');
const pushRoutes = require('./routes/push');
const templatesRoutes = require('./routes/templates');
const storesRoutes = require('./routes/stores');
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
