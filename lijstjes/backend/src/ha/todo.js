const { haFetch } = require('./client');

async function listTodoLists() {
  const states = await haFetch('/states');
  return states
    .filter((s) => s.entity_id.startsWith('todo.'))
    .map((s) => ({
      entity_id: s.entity_id,
      name: s.attributes.friendly_name || s.entity_id,
      count: Number(s.state) || 0,
    }));
}

async function getItems(entityId) {
  const result = await haFetch('/services/todo/get_items', {
    method: 'POST',
    query: { return_response: '' },
    body: { entity_id: entityId },
  });
  const items = result?.service_response?.[entityId]?.items || [];
  return items;
}

async function addItem(entityId, { summary, due_date, due_datetime, description }) {
  const body = { entity_id: entityId, item: summary };
  if (due_date) body.due_date = due_date;
  if (due_datetime) body.due_datetime = due_datetime;
  if (description) body.description = description;
  await haFetch('/services/todo/add_item', { method: 'POST', body });
}

async function updateItem(entityId, uid, changes) {
  const body = { entity_id: entityId, item: uid };
  if (changes.summary !== undefined) body.rename = changes.summary;
  if (changes.status !== undefined) body.status = changes.status;
  if (changes.due_date !== undefined) body.due_date = changes.due_date || '';
  if (changes.due_datetime !== undefined) body.due_datetime = changes.due_datetime || '';
  if (changes.description !== undefined) body.description = changes.description || '';
  await haFetch('/services/todo/update_item', { method: 'POST', body });
}

async function removeItem(entityId, uidOrSummary) {
  await haFetch('/services/todo/remove_item', {
    method: 'POST',
    body: { entity_id: entityId, item: [uidOrSummary] },
  });
}

async function moveItem(entityId, uid, previousUid) {
  const body = { entity_id: entityId, uid };
  if (previousUid !== undefined) body.previous_uid = previousUid;
  await haFetch('/services/todo/move_item', { method: 'POST', body });
}

module.exports = { listTodoLists, getItems, addItem, updateItem, removeItem, moveItem };
