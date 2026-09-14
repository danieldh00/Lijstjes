const express = require('express');
const { listTemplates, createTemplate, deleteTemplate } = require('../templates');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ templates: listTemplates(req.query.entity_id) });
});

router.post('/', (req, res) => {
  const { name, entity_id: entityId, items } = req.body || {};
  if (!name || !entityId || !Array.isArray(items) || !items.filter((i) => String(i).trim()).length) {
    return res.status(400).json({
      error: 'invalid_template',
      message: 'Naam, lijst en minstens één item zijn verplicht.',
    });
  }
  res.json(createTemplate({ name, entity_id: entityId, items }));
});

router.delete('/:id', (req, res) => {
  const ok = deleteTemplate(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

module.exports = router;
