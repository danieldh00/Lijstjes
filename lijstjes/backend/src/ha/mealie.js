const { haFetch } = require('./client');

// Koppeling met Mealie loopt volledig via Home Assistant's eigen
// Mealie-integratie: die kent de Mealie-server en het API-token al, dus de
// add-on hoeft daar zelf niets van te weten. We roepen dezelfde
// mealie.*-services aan die je ook in een automatisering zou gebruiken, met
// return_response -- precies zoals ha/todo.js dat voor todo.get_items doet.
//
// Elke mealie-service wil een config_entry_id; die zoeken we op via de
// config-entries-API en onthouden we, want die verandert niet.
let cachedEntryId = null;

async function getEntryId() {
  if (cachedEntryId) return cachedEntryId;
  const entries = await haFetch('/config/config_entries/entry', { query: { domain: 'mealie' } });
  if (!entries.length) {
    const error = new Error(
      'De Mealie-integratie is niet ingesteld in Home Assistant. Voeg die toe via Instellingen → Apparaten & diensten → Integratie toevoegen → Mealie.'
    );
    error.code = 'mealie_not_configured';
    throw error;
  }
  cachedEntryId = entries[0].entry_id;
  return cachedEntryId;
}

async function isAvailable() {
  try {
    await getEntryId();
    return true;
  } catch (err) {
    return false;
  }
}

async function callMealie(service, data) {
  const entryId = await getEntryId();
  return haFetch(`/services/mealie/${service}`, {
    method: 'POST',
    query: { return_response: '' },
    body: { config_entry_id: entryId, ...data },
  });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Het weekmenu van vandaag tot en met over een week. Alleen de maaltijden die
// aan een recept hangen zijn bruikbaar -- een los ingetypte maaltijd zonder
// recept heeft geen ingrediënten om toe te voegen.
async function getMealplan(days = 7) {
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const response = await callMealie('get_mealplan', {
    start_date: isoDate(start),
    end_date: isoDate(end),
  });

  const entries = (response && response.service_response && response.service_response.mealplan) || [];
  return entries
    .filter((entry) => entry.recipe && entry.recipe.recipe_id)
    .map((entry) => ({
      id: String(entry.mealplan_id),
      date: entry.mealplan_date,
      type: entry.entry_type,
      name: entry.recipe.name,
      recipe_id: entry.recipe.recipe_id,
    }));
}

async function searchRecipes(term, limit = 20) {
  const response = await callMealie('get_recipes', {
    ...(term ? { search_terms: term } : {}),
    result_limit: limit,
  });

  const payload = (response && response.service_response && response.service_response.recipes) || {};
  return (payload.items || []).map((recipe) => ({
    recipe_id: recipe.recipe_id,
    name: recipe.name,
  }));
}

// Mealie geeft een hoeveelheid als getal terug (2.0, 0.5). Op een
// boodschappenlijst wil je "2" zien en niet "2.0", en "1/2" leest prettiger
// dan "0.5".
const BREUKEN = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4', 0.33: '1/3', 0.67: '2/3' };

function formatQuantity(quantity) {
  if (!quantity) return '';
  if (Number.isInteger(quantity)) return String(quantity);
  const afgerond = Math.round(quantity * 100) / 100;
  if (BREUKEN[afgerond]) return BREUKEN[afgerond];
  const heel = Math.floor(afgerond);
  const rest = Math.round((afgerond - heel) * 100) / 100;
  if (heel > 0 && BREUKEN[rest]) return `${heel} ${BREUKEN[rest]}`;
  return String(afgerond);
}

function formatUnit(unit, quantity) {
  if (!unit) return '';
  const meervoud = quantity > 1;
  if (unit.use_abbreviation && unit.abbreviation) {
    return (meervoud && unit.plural_abbreviation) || unit.abbreviation;
  }
  return (meervoud && unit.plural_name) || unit.name || '';
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

// Het product vooraan, de hoeveelheid tussen haakjes erachter: "Ui (2 stuks)".
// Zo blijft de lijst leesbaar en op productnaam te sorteren of te groeperen
// per winkel, terwijl je in de winkel toch ziet hoeveel je nodig hebt.
function formatIngredient(ingredient) {
  const food = ingredient.food && ingredient.food.name;
  const meervoud = ingredient.quantity > 1;
  const product =
    (food && ((meervoud && ingredient.food.plural_name) || food)) ||
    ingredient.note ||
    ingredient.display ||
    ingredient.original_text ||
    '';
  if (!product.trim()) return null;

  // Zonder los productveld staat de hoeveelheid al in de tekst zelf; die dan
  // niet nog een keer erachter plakken.
  const hoeveelheid = food
    ? [formatQuantity(ingredient.quantity), formatUnit(ingredient.unit, ingredient.quantity)]
        .filter(Boolean)
        .join(' ')
    : '';

  return capitalize(product.trim()) + (hoeveelheid ? ` (${hoeveelheid})` : '');
}

async function getRecipeIngredients(recipeId) {
  const response = await callMealie('get_recipe', { recipe_id: recipeId });
  const recipe = (response && response.service_response && response.service_response.recipe) || {};
  const ingredients = (recipe.ingredients || []).map(formatIngredient).filter(Boolean);
  return { name: recipe.name || '', ingredients };
}

module.exports = { isAvailable, getMealplan, searchRecipes, getRecipeIngredients, formatIngredient };
