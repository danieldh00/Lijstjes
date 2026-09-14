const express = require('express');
const { getPublicKey, addSubscription, removeSubscription } = require('../push');

const router = express.Router();

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

router.post('/subscribe', (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'subscription_required' });
  }
  addSubscription(req.deviceId || null, subscription);
  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) removeSubscription(endpoint);
  res.json({ ok: true });
});

module.exports = router;
