const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const ORDER_FILE = path.join(DATA_DIR, 'list-order.json');

// In welke volgorde lijstjes op het overzicht staan -- Home Assistant kent
// hier geen instelling voor (todo-lijsten hebben geen "volgorde"-veld via
// de API), dus dit is een puur app-eigen voorkeur, opgeslagen als een
// geordende array van entity_ids.

function getOrder() {
  try {
    return JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function setOrder(order) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ORDER_FILE, JSON.stringify(order, null, 2), { mode: 0o600 });
}

module.exports = { getOrder, setOrder };
