const express = require('express');
const { addItem, updateItem, removeItem, moveItem, getItems } = require('../ha/todo');
const { createTodoList } = require('../ha/lists');
const { buildSnapshot } = require('../ha/snapshot');

const router = express.Router();

// Bounded de-dup van recent verwerkte mutaties: voorkomt een dubbel item als
// een toestel een sync-poging herhaalt na een afgebroken verbinding. In het
// geheugen van het proces -- een herstart van de add-on maakt dit leeg, en
// voor persoonlijk/huishoudelijk gebruik is dat een acceptabele grens (in het
// ergste geval één dubbel item, makkelijk zelf te verwijderen).
const processedMutations = new Map();
const PROCESSED_LIMIT = 500;

function rememberProcessed(id, result) {
  processedMutations.set(id, result);
  if (processedMutations.size > PROCESSED_LIMIT) {
    processedMutations.delete(processedMutations.keys().next().value);
  }
}

function resolveUid(mutation, resolvedUids) {
  if (mutation.uid) return mutation.uid;
  if (mutation.clientItemId && resolvedUids.has(mutation.clientItemId)) {
    return resolvedUids.get(mutation.clientItemId).uid;
  }
  return mutation.item;
}

async function applyMutation(mutation, resolvedUids) {
  switch (mutation.type) {
    case 'create_list': {
      const list = await createTodoList(mutation.name);
      return { entity_id: list.entity_id, name: list.name, pending: !!list.pending };
    }
    case 'add_item': {
      await addItem(mutation.entity_id, {
        summary: mutation.summary,
        due_date: mutation.due_date,
        due_datetime: mutation.due_datetime,
        description: mutation.description,
      });
      const items = await getItems(mutation.entity_id);
      const match = items.filter((it) => it.summary === mutation.summary).pop();
      if (match && mutation.clientItemId) {
        resolvedUids.set(mutation.clientItemId, { entity_id: mutation.entity_id, uid: match.uid });
      }
      return { uid: match?.uid, entity_id: mutation.entity_id };
    }
    case 'update_item': {
      const uid = resolveUid(mutation, resolvedUids);
      await updateItem(mutation.entity_id, uid, {
        summary: mutation.summary,
        status: mutation.status,
        due_date: mutation.due_date,
        due_datetime: mutation.due_datetime,
        description: mutation.description,
      });
      return { uid, entity_id: mutation.entity_id };
    }
    case 'remove_item': {
      const uid = resolveUid(mutation, resolvedUids);
      await removeItem(mutation.entity_id, uid);
      return { uid, entity_id: mutation.entity_id };
    }
    case 'move_item': {
      const uid = resolveUid(mutation, resolvedUids);
      await moveItem(mutation.entity_id, uid, mutation.previous_uid);
      return { uid, entity_id: mutation.entity_id };
    }
    default:
      throw new Error(`Onbekend mutatietype: ${mutation.type}`);
  }
}

router.post('/', async (req, res, next) => {
  try {
    const mutations = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
    const results = [];
    const resolvedUids = new Map();

    for (const mutation of mutations) {
      const { clientMutationId } = mutation;
      if (clientMutationId && processedMutations.has(clientMutationId)) {
        results.push({ clientMutationId, ok: true, ...processedMutations.get(clientMutationId) });
        continue;
      }
      try {
        const result = await applyMutation(mutation, resolvedUids);
        results.push({ clientMutationId, ok: true, ...result });
        if (clientMutationId) rememberProcessed(clientMutationId, result);
      } catch (err) {
        results.push({ clientMutationId, ok: false, error: err.message });
      }
    }

    res.json({ results, snapshot: await buildSnapshot() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
