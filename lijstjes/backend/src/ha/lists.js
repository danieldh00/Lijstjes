const { haFetch } = require('./client');
const { sendCommands } = require('./websocket');

// Zoekt bij een todo-entiteit de local_todo-integratie die 'm aanmaakte. Home
// Assistant's REST-API legt geen verband tussen een entiteit en zijn config
// entry, dus we matchen op naam -- dezelfde aanpak als bij het aanmaken. Het
// hernoemen hieronder past titel én entiteitsnaam samen aan, juist zodat die
// twee gelijk blijven lopen en deze match blijft kloppen.
async function findListEntry(entityId, doel) {
  const states = await haFetch('/states');
  const entityState = states.find((s) => s.entity_id === entityId);
  if (!entityState) {
    throw new Error(`Lijst ${entityId} bestaat niet (meer) in Home Assistant.`);
  }
  const friendlyName = entityState.attributes.friendly_name || '';

  const entries = await haFetch('/config/config_entries/entry', { query: { domain: 'local_todo' } });
  const match = entries.find((e) => (e.title || '').toLowerCase() === friendlyName.toLowerCase());
  if (!match) {
    throw new Error(`Kon de Home Assistant-integratie voor "${friendlyName}" niet vinden om te ${doel}.`);
  }
  return match;
}

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

// Verwijdert een lijst door de onderliggende local_todo-integratie te
// verwijderen (verwijdert ook alle items van die lijst permanent -- er is
// geen "prullenbak"). HA's todo-domein geeft geen rechtstreekse
// entity->config-entry-koppeling via de REST API terug, dus matchen we
// (net als bij het aanmaken hierboven) op naam: de titel van een
// local_todo-config-entry is altijd de naam die bij het aanmaken is
// opgegeven, en die komt overeen met de vriendelijke naam van de bijhorende
// entiteit.
async function deleteTodoList(entityId) {
  const entry = await findListEntry(entityId, 'verwijderen');
  await haFetch(`/config/config_entries/entry/${entry.entry_id}`, { method: 'DELETE' });
}

// Hernoemen kan niet via REST (zie ha/websocket.js) en gebeurt daarom via twee
// WebSocket-commando's:
//   - de titel van de integratie, zodat de lijst ook in Home Assistant's eigen
//     integratieoverzicht de nieuwe naam draagt;
//   - de naam in de entiteitenregistratie, want dát is wat friendly_name -- en
//     dus de naam die de app en de HA-app tonen -- werkelijk bepaalt.
// Ze worden allebei gezet zodat de twee gelijk blijven lopen; findListEntry
// hierboven leunt daarop. De opslag van de items hangt aan entry.data en blijft
// hierbij ongemoeid, en een titelwijziging herlaadt de integratie niet, dus het
// entity_id en de items veranderen niet.
async function renameTodoList(entityId, name) {
  const entry = await findListEntry(entityId, 'hernoemen');
  await sendCommands([
    { type: 'config_entries/update', entry_id: entry.entry_id, title: name },
    { type: 'config/entity_registry/update', entity_id: entityId, name },
  ]);
}

module.exports = { createTodoList, deleteTodoList, renameTodoList };
