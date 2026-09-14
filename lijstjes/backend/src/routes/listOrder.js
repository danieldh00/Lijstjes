const express = require('express');
const { getOrder, setOrder } = require('../listOrder');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ order: getOrder() });
});

router.post('/', (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'invalid_order', message: 'order moet een array van entity_ids zijn.' });
  }
  setOrder(order);
  res.json({ order });
});

module.exports = router;
