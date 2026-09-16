const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.addInitScript(() => {
    window.__lists = [{ entity_id: 'todo.a', name: 'Boodschappen' }];
    window.__items = { 'todo.a': [{ uid: 'u1', summary: 'Melk', status: 'needs_action' }] };
    window.__failSync = false;
    // Elke statusbalk die ook maar even zichtbaar wordt, vastleggen.
    window.__gezien = new Set();
    const orig = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({});
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (window.__failSync && (u.includes('/api/sync') || u.includes('/api/content'))) {
        throw new TypeError('netwerkfout (gesimuleerd)');
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
  await page.waitForTimeout(400);

  // Statusbalk continu bemonsteren tijdens normaal gebruik.
  await page.evaluate(() => {
    const el = document.getElementById('statusbar');
    setInterval(() => {
      if (!el.hidden && el.textContent.trim()) window.__gezien.add(el.textContent.trim());
    }, 20);
  });

  await page.waitForTimeout(1200);
  console.log('A. na opstarten + poll, balk zichtbaar:', await page.evaluate(() => !document.getElementById('statusbar').hidden));

  // Item toevoegen -> mutatie + flush
  await page.fill('#new-item-summary', 'Brood');
  await page.click('#add-item-form button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('B. na item toevoegen, balk zichtbaar:', await page.evaluate(() => !document.getElementById('statusbar').hidden));

  // Een paar items snel achter elkaar
  for (const naam of ['Kaas', 'Eieren', 'Boter']) {
    await page.fill('#new-item-summary', naam);
    await page.click('#add-item-form button[type="submit"]');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(2500);
  console.log('C. na reeks toevoegingen, balk zichtbaar:', await page.evaluate(() => !document.getElementById('statusbar').hidden));

  console.log('   alles wat de balk ooit toonde:', JSON.stringify([...await page.evaluate(() => [...window.__gezien])]));

  // Offline gaan -> balk moet WEL verschijnen
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    window.dispatchEvent(new Event('offline'));
  });
  await page.waitForTimeout(500);
  console.log('\nD. offline, balk:', await page.evaluate(() => {
    const el = document.getElementById('statusbar');
    return el.hidden ? '(verborgen)' : el.textContent.trim();
  }));

  // Offline met wachtende wijziging
  await page.fill('#new-item-summary', 'Yoghurt');
  await page.click('#add-item-form button[type="submit"]');
  await page.waitForTimeout(1200);
  console.log('E. offline + wachtende wijziging, balk:', await page.evaluate(() => {
    const el = document.getElementById('statusbar');
    return el.hidden ? '(verborgen)' : el.textContent.trim();
  }));

  // Weer online, sync lukt -> balk moet weer verdwijnen
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(2000);
  console.log('F. weer online, balk zichtbaar:', await page.evaluate(() => !document.getElementById('statusbar').hidden));

  console.log('\nconsole errors:', errors.length ? errors : 'geen');
  await browser.close();
})();
