const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 600 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // 40 items zodat er echt gescrold kan worden
  const mkItems = (n) => Array.from({ length: n }, (_, i) => ({
    uid: `u${i}`, summary: `Item ${i}`, status: 'needs_action',
  }));

  await page.addInitScript((initialItems) => {
    window.__items = initialItems;
    window.__contentCalls = 0;
    const origFetch = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true });
      if (u.includes('/api/content')) {
        window.__contentCalls++;
        // syncedAt verandert bij elke poll -- precies zoals de echte backend
        return json({ lists: [{ entity_id: 'todo.a', name: 'Boodschappen' }],
                      items: { 'todo.a': window.__items }, syncedAt: new Date().toISOString() });
      }
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({});
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/sync')) {
        const body = JSON.parse(opts.body);
        return json({ results: body.mutations.map((m) => ({ clientMutationId: m.clientMutationId, ok: true })),
                      snapshot: { lists: [{ entity_id: 'todo.a', name: 'Boodschappen' }],
                                  items: { 'todo.a': window.__items }, syncedAt: new Date().toISOString() } });
      }
      return origFetch(url, opts);
    };
  }, mkItems(40));

  await page.goto('http://localhost:8791/#/list/todo.a');
  await page.waitForTimeout(600);

  // Markeer een bestaand DOM-knooppunt: overleeft het een achtergrondsync?
  await page.evaluate(() => {
    document.querySelector('.item-row').dataset.marker = 'origineel';
  });

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.fill('#new-item-summary', 'Halfgetypte tekst');
  await page.evaluate(() => document.getElementById('new-item-summary').focus());

  const before = await page.evaluate(() => window.__contentCalls);

  // Simuleer een tabwissel/terugkeer -> flush() -> render()
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); });
  await page.waitForTimeout(900);

  const r1 = await page.evaluate(() => ({
    contentCalls: window.__contentCalls,
    markerBewaard: document.querySelector('.item-row')?.dataset.marker === 'origineel',
    scrollY: Math.round(window.scrollY),
    inputWaarde: document.getElementById('new-item-summary').value,
    heeftFocus: document.activeElement?.id === 'new-item-summary',
  }));
  console.log('na achtergrondsync (onveranderde data):', JSON.stringify(r1));
  console.log('  -> polls uitgevoerd:', r1.contentCalls > before ? 'ja' : 'NEE (poll vond niet plaats!)');

  // Nu een echte wijziging vanuit HA: her-render moet wél gebeuren
  await page.evaluate(() => { window.__items = [...window.__items, { uid: 'nieuw', summary: 'Vanuit HA', status: 'needs_action' }]; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(900);

  const r2 = await page.evaluate(() => ({
    aantalRijen: document.querySelectorAll('.item-row').length,
    bevatNieuw: [...document.querySelectorAll('.item-summary')].some((e) => e.textContent === 'Vanuit HA'),
    markerBewaard: document.querySelector('.item-row')?.dataset.marker === 'origineel',
    scrollY: Math.round(window.scrollY),
    inputWaarde: document.getElementById('new-item-summary').value,
    heeftFocus: document.activeElement?.id === 'new-item-summary',
  }));
  console.log('na echte wijziging vanuit HA:', JSON.stringify(r2));

  // Item toevoegen via het formulier: veld moet leeg zijn na toevoegen
  await page.fill('#new-item-summary', 'Melk');
  await page.click('#add-item-form button[type="submit"]');
  await page.waitForTimeout(300);
  const r3 = await page.evaluate(() => ({
    inputWaarde: document.getElementById('new-item-summary').value,
    bevatMelk: [...document.querySelectorAll('.item-summary')].some((e) => e.textContent === 'Melk'),
  }));
  console.log('na item toevoegen via formulier:', JSON.stringify(r3));

  console.log('console errors:', errors);
  await browser.close();
})();
