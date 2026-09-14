const { haFetch } = require('./client');

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Maakt een nieuwe to-do-lijst aan in Home Assistant door een nieuwe
// local_todo-integratie te configureren via de config-entries-flow-API
// (dezelfde API die het HA-frontend gebruikt om integraties toe te voegen).
// Er is geen los "maak een lijst"-service in HA's todo-domein -- elke lijst
// is een eigen integratie-instantie.
async function createTodoList(name) {
  const flow = await haFetch('/config/config_entries/flow', {
    method: 'POST',
    body: { handler: 'local_todo', show_advanced_options: false },
  });

  let result = flow;
  if (flow.type !== 'create_entry') {
    const schema = flow.data_schema || [];
    const nameField =
      schema.find((f) => f.name === 'todo_list_name') ||
      schema.find((f) => f.required) ||
      schema[0];
    if (!nameField) {
      throw new Error('Onverwacht formulier van Home Assistant bij het aanmaken van een lijst.');
    }

    result = await haFetch(`/config/config_entries/flow/${flow.flow_id}`, {
      method: 'POST',
      body: { [nameField.name]: name },
    });

    if (result.type !== 'create_entry') {
      throw new Error(
        result.errors ? `Home Assistant weigerde de lijst: ${JSON.stringify(result.errors)}` : 'Aanmaken van de lijst is mislukt.'
      );
    }
  }

  return waitForListEntity(name, result.title);
}

// De entiteit verschijnt meestal binnen een paar honderd ms nadat de
// config entry is aangemaakt; kort pollen op /states in plaats van aannemen
// dat 'ie er al meteen is.
async function waitForListEntity(expectedName, fallbackTitle) {
  const wantedName = (expectedName || fallbackTitle || '').toLowerCase();
  const slugGuess = slugify(expectedName || fallbackTitle);

  for (let attempt = 0; attempt < 10; attempt++) {
    const states = await haFetch('/states');
    const match = states.find(
      (s) =>
        s.entity_id.startsWith('todo.') &&
        (s.entity_id === `todo.${slugGuess}` || (s.attributes.friendly_name || '').toLowerCase() === wantedName)
    );
    if (match) {
      return { entity_id: match.entity_id, name: match.attributes.friendly_name || match.entity_id, pending: false };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Config entry bestaat wel degelijk, entiteit is alleen nog niet gezien --
  // verschijnt vanzelf bij de eerstvolgende lijst-sync.
  return { entity_id: null, name: expectedName || fallbackTitle, pending: true };
}

module.exports = { createTodoList };
