const { listTodoLists, getItems } = require('./todo');

// Volledige inhoud van alle lijstjes in één keer -- gebruikt zowel voor de
// eerste (online) vulling van de lokale offline-opslag op een toestel als
// voor de canonieke staat die na elke sync wordt teruggestuurd.
async function buildSnapshot() {
  const lists = await listTodoLists();
  const items = {};
  for (const list of lists) {
    items[list.entity_id] = await getItems(list.entity_id);
  }
  return { lists, items, syncedAt: new Date().toISOString() };
}

module.exports = { buildSnapshot };
