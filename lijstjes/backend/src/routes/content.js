const express = require('express');
const { buildSnapshot } = require('../ha/snapshot');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await buildSnapshot());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
