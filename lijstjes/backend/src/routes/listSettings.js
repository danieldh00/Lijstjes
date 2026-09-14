const express = require('express');
const { getSettings, getAllSettings, setSettings } = require('../listSettings');

const router = express.Router();

router.get('/', (req, res) => {
  const entityId = req.query.entity_id;
  res.json(entityId ? getSettings(entityId) : getAllSettings());
});

router.post('/', (req, res) => {
  const { entity_id: entityId, templatesEnabled, storesEnabled } = req.body || {};
  if (!entityId) {
    return res.status(400).json({ error: 'entity_id_required', message: 'entity_id is verplicht.' });
  }
  res.json(setSettings(entityId, { templatesEnabled, storesEnabled }));
});

module.exports = router;
