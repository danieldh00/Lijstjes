const express = require('express');
const { listItemStores, rememberItemStore } = require('../itemStoreMemory');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ itemStores: listItemStores(req.query.entity_id) });
});

router.post('/', (req, res) => {
  const { entity_id: entityId, item_name: itemName, store } = req.body || {};
  if (!entityId || !itemName || !store) {
    return res.status(400).json({ error: 'invalid_item_store', message: 'entity_id, item_name en store zijn verplicht.' });
  }
  rememberItemStore(entityId, itemName, store);
  res.json({ ok: true });
});

module.exports = router;
