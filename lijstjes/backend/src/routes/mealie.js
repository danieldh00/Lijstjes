const express = require('express');
const mealie = require('../ha/mealie');

const router = express.Router();

// Alles hier praat live met Mealie via Home Assistant, dus het werkt alleen
// online. Dat is geen bezwaar: het ophalen van een weekmenu doe je thuis bij
// het samenstellen van de lijst, niet in de winkel. De items die eruit komen
// gaan daarna via de gewone wachtrij en zijn dus wél offline beschikbaar.
function handle(handler) {
  return async (req, res) => {
    try {
      res.json(await handler(req));
    } catch (err) {
      const status = err.code === 'mealie_not_configured' ? 503 : 502;
      res.status(status).json({ error: err.code || 'mealie_error', message: err.message });
    }
  };
}

router.get(
  '/status',
  handle(async () => ({ available: await mealie.isAvailable() }))
);

router.get(
  '/mealplan',
  handle(async () => ({ meals: await mealie.getMealplan() }))
);

router.get(
  '/recipes',
  handle(async (req) => ({ recipes: await mealie.searchRecipes((req.query.q || '').trim()) }))
);

router.get(
  '/recipes/:recipeId/ingredients',
  handle(async (req) => mealie.getRecipeIngredients(req.params.recipeId))
);

module.exports = router;
