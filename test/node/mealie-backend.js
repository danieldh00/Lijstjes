// Test ha/mealie.js tegen een nagebootste Home Assistant REST-API, zodat de
// service-aanroepen, het uitpakken van service_response en het omzetten naar
// lijstitems echt uitgevoerd worden.
const Module = require('module');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'lijstjes', 'backend', 'src');
const calls = [];

const vandaag = new Date().toISOString().slice(0, 10);
const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const HA = {
  '/config/config_entries/entry': [{ entry_id: 'mealie-entry-1', domain: 'mealie', title: 'Mealie' }],
  '/services/mealie/get_mealplan': {
    service_response: {
      mealplan: [
        {
          mealplan_id: 1,
          entry_type: 'dinner',
          mealplan_date: vandaag,
          title: null,
          description: null,
          recipe: { recipe_id: 'r-pasta', name: 'Pasta Bolognese', slug: 'pasta-bolognese' },
        },
        {
          mealplan_id: 2,
          entry_type: 'dinner',
          mealplan_date: morgen,
          title: 'Uit eten',
          description: null,
          recipe: null, // geen recept -> moet eruit gefilterd worden
        },
      ],
    },
  },
  '/services/mealie/get_recipes': {
    service_response: { recipes: { items: [{ recipe_id: 'r-soep', name: 'Tomatensoep' }] } },
  },
  '/services/mealie/get_recipe': {
    service_response: {
      recipe: {
        recipe_id: 'r-pasta',
        name: 'Pasta Bolognese',
        ingredients: [
          { quantity: 500, unit: { name: 'gram', abbreviation: 'g', use_abbreviation: true }, food: { name: 'gehakt' }, note: '' },
          { quantity: 2, unit: { name: 'stuk', plural_name: 'stuks' }, food: { name: 'ui', plural_name: 'uien' }, note: '' },
          { quantity: null, unit: null, food: null, note: 'snufje zout', display: 'snufje zout' },
          { quantity: null, unit: null, food: null, note: '', display: '' }, // leeg -> weglaten
        ],
      },
    },
  },
};

const origLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && parent.filename && parent.filename.endsWith(path.join('ha', 'mealie.js'))) {
    if (request === './client') {
      return {
        haFetch: async (endpoint, options = {}) => {
          calls.push({ endpoint, method: options.method || 'GET', body: options.body, query: options.query });
          if (endpoint in HA) return HA[endpoint];
          throw new Error(`onverwachte aanroep: ${endpoint}`);
        },
      };
    }
  }
  return origLoad.apply(this, arguments);
};

const mealie = require(path.join(SRC, 'ha', 'mealie.js'));

(async () => {
  console.log('beschikbaar:', await mealie.isAvailable());

  const meals = await mealie.getMealplan();
  console.log('\nweekmenu:', JSON.stringify(meals, null, 1));
  console.log('maaltijd zonder recept eruit gefilterd:', meals.length === 1 ? 'ja' : 'NEE');

  const recipes = await mealie.searchRecipes('soep');
  console.log('\nzoekresultaat:', JSON.stringify(recipes));

  const { name, ingredients } = await mealie.getRecipeIngredients('r-pasta');
  console.log('\nrecept:', name);
  console.log('ingredienten:', JSON.stringify(ingredients));
  console.log('lege ingredient weggelaten:', ingredients.length === 3 ? 'ja' : 'NEE');

  console.log('\n--- aanroepen naar Home Assistant ---');
  for (const c of calls) {
    console.log(`${c.method} ${c.endpoint}`, c.query ? `query=${JSON.stringify(c.query)}` : '', c.body ? `body=${JSON.stringify(c.body)}` : '');
  }

  const entryCalls = calls.filter((c) => c.endpoint === '/config/config_entries/entry').length;
  console.log('\nconfig entry maar één keer opgezocht (gecachet):', entryCalls === 1 ? 'ja' : `NEE (${entryCalls}x)`);
})();
