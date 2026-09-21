const express = require('express');
const { listItemHistory, bumpItemHistory } = require('../itemHistory');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ itemHistory: listItemHistory(req.query.entity_id) });
});

router.post('/', (req, res) => {
  const { entity_id: entityId, summary } = req.body || {};
  if (!entityId || !summary) {
    return res.status(400).json({ error: 'invalid_item_history', message: 'entity_id en summary zijn verplicht.' });
  }
  bumpItemHistory(entityId, summary);
  res.json({ ok: true });
});

module.exports = router;
