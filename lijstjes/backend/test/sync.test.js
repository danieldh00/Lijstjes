const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedMutation } = require('../src/routes/sync');

test('create_list heeft geen bestaande entity_id nodig', () => {
  assert.equal(isAllowedMutation({ type: 'create_list', name: 'Klussen' }, new Set()), true);
});

test('een mutatie op een bekende lijst is toegestaan', () => {
  const valid = new Set(['todo.boodschappen']);
  assert.equal(isAllowedMutation({ type: 'add_item', entity_id: 'todo.boodschappen' }, valid), true);
});

test('een mutatie op een onbekende entity_id wordt geweigerd', () => {
  // Dekt de fix voor: een gekoppeld toestel dat via /api/sync een
  // willekeurige todo.*-entiteit probeert aan te spreken die niet in de
  // huidige lijst van lijstjes voorkomt.
  const valid = new Set(['todo.boodschappen']);
  assert.equal(isAllowedMutation({ type: 'add_item', entity_id: 'todo.iets_anders' }, valid), false);
  assert.equal(isAllowedMutation({ type: 'update_item', entity_id: 'todo.iets_anders' }, valid), false);
  assert.equal(isAllowedMutation({ type: 'remove_item', entity_id: 'todo.iets_anders' }, valid), false);
  assert.equal(isAllowedMutation({ type: 'move_item', entity_id: 'todo.iets_anders' }, valid), false);
});

test('een ontbrekende entity_id wordt geweigerd', () => {
  assert.equal(isAllowedMutation({ type: 'add_item' }, new Set(['todo.boodschappen'])), false);
});
