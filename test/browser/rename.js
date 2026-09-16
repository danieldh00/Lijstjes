const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(() => {
    window.__lists = [{ entity_id: 'todo.a', name: 'Klussen' }];
    window.__items = { 'todo.a': [{ uid: 'u1', summary: 'Kraan', status: 'needs_action' }] };
    window.__mutaties = [];
    const orig = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) {
        if (opts && opts.method === 'POST') return json(JSON.parse(opts.body));
        return json({});
      }
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/content')) return json({ lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() });
      if (u.includes('/api/sync')) {
        const body = JSON.parse(opts.body);
        for (const m of body.mutations) {
          window.__mutaties.push(m);
          // Server past de naam toe, zoals de echte backend via HA doet.
          if (m.type === 'rename_list') {
            const l = window.__lists.find((x) => x.entity_id === m.entity_id);
            if (l) l.name = m.name;
          }
        }
        return json({
          results: body.mutations.map((m) => ({ clientMutationId: m.clientMutationId, ok: true })),
          snapshot: { lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() },
        });
      }
      return orig(url, opts);
    };
  });

  const naamEnIcoon = async () => {
    // Het instellingenformulier navigeert naar de detailpagina; voor de rij
    // met naam + icoon moeten we terug naar het overzicht.
    await page.goto('http://localhost:8791/#/');
    await page.waitForTimeout(500);
    return page.evaluate(() => ({
      naam: document.querySelector('.list-card .name')?.textContent,
      icoon: document.querySelector('.list-card-row .list-icon')?.getAttribute('style'),
      kop: document.querySelector('.list-card .sub')?.textContent,
    }));
  };

  await page.goto('http://localhost:8791/#/');
  await page.waitForTimeout(800);
  console.log('voor hernoemen :', JSON.stringify(await naamEnIcoon()));

  // Via het tandwiel naar instellingen en hernoemen.
  await page.goto('http://localhost:8791/#/list/todo.a/settings');
  await page.waitForTimeout(500);
  const veldWaarde = await page.inputValue('#settings-name');
  console.log('naamveld voorgevuld met:', JSON.stringify(veldWaarde));

  await page.fill('#settings-name', 'Boodschappen');
  await page.click('#list-settings-form button[type="submit"]');
  await page.waitForTimeout(1800);

  console.log('na hernoemen   :', JSON.stringify(await naamEnIcoon()));
  console.log('verstuurde mutaties:', JSON.stringify(await page.evaluate(() => window.__mutaties)));

  // Offline hernoemen -> moet in de wachtrij komen en later doorgaan.
  await page.evaluate(() => {
    window.__mutaties = [];
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    window.dispatchEvent(new Event('offline'));
  });
  await page.goto('http://localhost:8791/#/list/todo.a/settings');
  await page.waitForTimeout(400);
  await page.fill('#settings-name', 'Weekboodschappen');
  await page.click('#list-settings-form button[type="submit"]');
  await page.waitForTimeout(1200);
  console.log('\noffline hernoemd, direct zichtbaar:', JSON.stringify(await naamEnIcoon()));
  console.log('offline verstuurd (hoort leeg):', JSON.stringify(await page.evaluate(() => window.__mutaties)));

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(2000);
  console.log('na weer online, verstuurd:', JSON.stringify(await page.evaluate(() => window.__mutaties)));
  console.log('eindstand      :', JSON.stringify(await naamEnIcoon()));

  console.log('\nconsole errors:', errors.length ? errors : 'geen');
  await browser.close();
})();
