const express = require('express');
const { listStores, createStore, deleteStore } = require('../stores');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ stores: listStores(req.query.entity_id) });
});

router.post('/', (req, res) => {
  const { name, entity_id: entityId } = req.body || {};
  if (!name || !String(name).trim() || !entityId) {
    return res.status(400).json({ error: 'invalid_store', message: 'Naam en lijst zijn verplicht.' });
  }
  res.json(createStore({ name, entity_id: entityId }));
});

router.delete('/:id', (req, res) => {
  const ok = deleteStore(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
