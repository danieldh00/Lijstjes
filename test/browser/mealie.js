const { chromium } = require('playwright');

const vandaag = new Date().toISOString().slice(0, 10);
const overmorgen = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(({ vandaag, overmorgen }) => {
    window.__lists = [{ entity_id: 'todo.a', name: 'Boodschappen' }];
    window.__items = { 'todo.a': [] };
    window.__mealieKapot = false;
    const orig = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/templates')) return json({ templates: [
        { id: 't1', entity_id: 'todo.a', name: 'Ontbijt', items: ['Brood', 'Jam'] },
      ] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) {
        if (opts && opts.method === 'POST') return json(JSON.parse(opts.body));
        return json({ 'todo.a': { templatesEnabled: true, storesEnabled: false, mealsEnabled: true } });
      }
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/mealie/mealplan')) {
        if (window.__mealieKapot) {
          return json({ error: 'mealie_not_configured', message: 'De Mealie-integratie is niet ingesteld in Home Assistant.' }, 503);
        }
        return json({ meals: [
          { id: '1', date: vandaag, type: 'dinner', name: 'Pasta Bolognese', recipe_id: 'r-pasta' },
          { id: '2', date: overmorgen, type: 'dinner', name: 'Curry', recipe_id: 'r-curry' },
        ] });
      }
      if (u.includes('/api/mealie/recipes/') && u.includes('/ingredients')) {
        return json({ name: 'Pasta Bolognese', ingredients: ['Gehakt (500 g)', 'Uien (2 stuks)', 'Snufje zout'] });
      }
      if (u.includes('/api/mealie/recipes')) {
        return json({ recipes: [{ recipe_id: 'r-soep', name: 'Tomatensoep' }] });
      }
      if (u.includes('/api/content')) return json({ lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() });
      if (u.includes('/api/sync')) {
        const body = JSON.parse(opts.body);
        for (const m of body.mutations) {
          if (m.type === 'add_item') window.__items['todo.a'].push({ uid: m.clientItemId, summary: m.summary, status: 'needs_action' });
        }
        return json({
          results: body.mutations.map((m) => ({ clientMutationId: m.clientMutationId, ok: true })),
          snapshot: { lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() },
        });
      }
      return orig(url, opts);
    };
  }, { vandaag, overmorgen });

  await page.goto('http://localhost:8791/#/list/todo.a');
  await page.waitForTimeout(1200);

  const rij = await page.$$eval('#quick-add-chips > *', (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
  console.log('volgorde in de rij:', JSON.stringify(rij));
  console.log('koppen boven de rij:', JSON.stringify(await page.$$eval('.section-title', (els) => els.map((e) => e.textContent))));

  // Maaltijd aantikken -> ingredienten toevoegen
  await page.click('#quick-add-chips .chip-apply[data-recipe="r-pasta"]');
  await page.waitForTimeout(1800);
  const items = await page.$$eval('.item-summary', (els) => els.map((e) => e.textContent));
  console.log('items na aantikken:', JSON.stringify(items));

  // Recept zoeken
  await page.fill('#meal-search', 'soep');
  await page.click('#meal-search-form button[type="submit"]');
  await page.waitForTimeout(900);
  const gevonden = await page.$$eval('#meal-results .chip-apply', (els) => els.map((e) => e.textContent.trim()));
  console.log('zoekresultaat:', JSON.stringify(gevonden));

  await page.click('#meal-results .chip-apply');
  await page.waitForTimeout(1800);
  const items2 = await page.$$eval('.item-summary', (els) => els.map((e) => e.textContent));
  console.log('items na zoekresultaat:', JSON.stringify(items2));

  // Foutgeval: integratie niet ingesteld
  await page.evaluate(() => { window.__mealieKapot = true; });
  const page2 = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
  await page2.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (url) => {
      const u = String(url);
      const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({ 'todo.a': { templatesEnabled: false, storesEnabled: false, mealsEnabled: true } });
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/mealie/mealplan')) return json({ error: 'mealie_not_configured', message: 'De Mealie-integratie is niet ingesteld in Home Assistant. Voeg die toe via Instellingen.' }, 503);
      if (u.includes('/api/content')) return json({ lists: [{ entity_id: 'todo.a', name: 'Boodschappen' }], items: { 'todo.a': [] }, syncedAt: new Date().toISOString() });
      if (u.includes('/api/sync')) return json({ results: [], snapshot: { lists: [{ entity_id: 'todo.a', name: 'Boodschappen' }], items: { 'todo.a': [] }, syncedAt: new Date().toISOString() } });
      return orig(url);
    };
  });
  await page2.goto('http://localhost:8791/#/list/todo.a');
  await page2.waitForTimeout(1500);
  console.log('\nmelding als Mealie niet ingesteld is:', JSON.stringify(await page2.$eval('#meals-extra', (e) => e.textContent.trim())));

  console.log('\nconsole errors:', errors.length ? errors : 'geen');
  await browser.close();
})();
