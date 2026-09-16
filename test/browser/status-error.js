const { chromium } = require('playwright');

const bar = (page) =>
  page.evaluate(() => {
    const el = document.getElementById('statusbar');
    return el.hidden ? '(verborgen)' : el.textContent.trim();
  });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    window.__lists = [{ entity_id: 'todo.a', name: 'Boodschappen' }];
    window.__items = { 'todo.a': [{ uid: 'u1', summary: 'Melk', status: 'needs_action' }] };
    window.__fail = false;
    const orig = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({});
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (window.__fail && (u.includes('/api/sync') || u.includes('/api/content'))) {
        throw new TypeError('server onbereikbaar (gesimuleerd)');
      }
      if (u.includes('/api/content')) return json({ lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() });
      if (u.includes('/api/sync')) {
        const body = JSON.parse(opts.body);
        return json({
          results: body.mutations.map((m) => ({ clientMutationId: m.clientMutationId, ok: true })),
          snapshot: { lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() },
        });
      }
      return orig(url, opts);
    };
  });

  await page.goto('http://localhost:8791/#/list/todo.a');
  await page.waitForTimeout(900);

  // G. Mislukte poll ZONDER wachtende wijzigingen -> stil blijven.
  await page.evaluate(() => { window.__fail = true; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1500);
  console.log('G. poll mislukt, niets in de wachtrij :', await bar(page));

  // H. Wijziging die niet weggeschreven kan worden -> wél melden.
  await page.fill('#new-item-summary', 'Brood');
  await page.click('#add-item-form button[type="submit"]');
  await page.waitForTimeout(1800);
  console.log('H. wijziging kan niet weg            :', await bar(page));

  // I. Server weer bereikbaar -> balk verdwijnt.
  await page.evaluate(() => { window.__fail = false; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1800);
  console.log('I. server weer bereikbaar            :', await bar(page));

  console.log('\nconsole errors:', errors.length ? errors : 'geen');
  await browser.close();
})();
