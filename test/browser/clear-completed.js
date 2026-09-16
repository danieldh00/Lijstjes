const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const snapshot = {
    syncedAt: Date.now(),
    lists: [{ entity_id: 'todo.a', name: 'Boodschappen', count: 1 }],
    items: {
      'todo.a': [
        { uid: '1', summary: 'Melk', status: 'needs_action' },
        { uid: '2', summary: 'Brood', status: 'completed' },
        { uid: '3', summary: 'Kaas', status: 'completed' },
      ],
    },
  };

  let lastSyncBody = null;

  await page.addInitScript((snap) => {
    window.__mockSnapshot = snap;
    const origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true });
      if (u.includes('/api/content')) return json(window.__mockSnapshot);
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({});
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/push/vapid-public-key')) return json({ key: '' });
      if (u.includes('/api/sync')) {
        const body = JSON.parse(opts.body);
        window.__lastSyncBody = body;
        for (const m of body.mutations) {
          if (m.type === 'remove_item') {
            window.__mockSnapshot.items[m.entity_id] = window.__mockSnapshot.items[m.entity_id].filter((i) => i.uid !== m.uid);
          }
        }
        const results = body.mutations.map((m) => ({ clientMutationId: m.clientMutationId, ok: true }));
        return json({ results, snapshot: window.__mockSnapshot });
      }
      return origFetch(url, opts);
    };
  }, snapshot);

  await page.goto('http://localhost:8791/#/list/todo.a');
  await page.waitForTimeout(800);

  const beforeCount = await page.$$eval('.item-row', (rows) => rows.length);
  console.log('items before:', beforeCount);

  page.once('dialog', (d) => d.accept());
  const clearBtn = await page.$('#clear-completed-btn');
  console.log('clear button found:', !!clearBtn);
  await clearBtn.click();
  await page.waitForTimeout(500);

  const afterCount = await page.$$eval('.item-row', (rows) => rows.length);
  console.log('items after:', afterCount);

  const lastSync = await page.evaluate(() => window.__lastSyncBody);
  console.log('mutations sent:', JSON.stringify(lastSync && lastSync.mutations));

  const stillHasClearBtn = await page.$('#clear-completed-btn');
  console.log('clear button still present:', !!stillHasClearBtn);

  console.log('console errors:', consoleErrors);

  await browser.close();
})();
