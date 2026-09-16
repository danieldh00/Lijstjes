const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(() => {
    window.__lists = [{ entity_id: 'todo.a', name: 'Boodschappen' }];
    window.__items = { 'todo.a': [{ uid: 'u1', summary: 'Melk', status: 'needs_action' }] };
    const orig = window.fetch;
    window.fetch = async (url, opts) => {
      const u = String(url);
      const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/auth/status')) return json({ paired: true, viaIngress: true });
      if (u.includes('/api/content')) return json({ lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() });
      if (u.includes('/api/templates')) return json({ templates: [] });
      if (u.includes('/api/stores')) return json({ stores: [] });
      if (u.includes('/api/list-settings')) return json({});
      if (u.includes('/api/list-order')) return json({ order: ['todo.a'] });
      if (u.includes('/api/sync')) return json({ results: [], snapshot: { lists: window.__lists, items: window.__items, syncedAt: new Date().toISOString() } });
      return orig(url, opts);
    };
  });

  await page.goto('http://localhost:8791/#/');
  await page.waitForTimeout(800);

  const chipColor = () => page.$eval('.add-list-form .list-icon', (e) => e.getAttribute('style'));

  const leeg = await chipColor();
  await page.fill('#new-list-name', 'Sportschool');
  await page.waitForTimeout(200);
  const gevuld = await chipColor();
  console.log('icoon leeg   :', leeg);
  console.log('icoon getypt :', gevuld);
  console.log('voorbeeld verandert mee:', leeg !== gevuld ? 'ja' : 'NEE');

  // Achtergrondwijziging vanuit HA terwijl er getypt staat -> her-render.
  await page.evaluate(() => {
    window.__lists = [...window.__lists, { entity_id: 'todo.b', name: 'Klussen' }];
    window.__items['todo.b'] = [];
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(900);

  const na = await page.evaluate(() => ({
    style: document.querySelector('.add-list-form .list-icon').getAttribute('style'),
    waarde: document.getElementById('new-list-name').value,
    rijen: document.querySelectorAll('.list-card-row').length,
  }));
  console.log('na her-render:', JSON.stringify(na));
  console.log('voorbeeld bewaard over her-render:', na.style === gevuld ? 'ja' : 'NEE');

  // Icoon in de detailkop
  await page.goto('http://localhost:8791/#/list/todo.a');
  await page.waitForTimeout(600);
  const kop = await page.$eval('.topbar .list-icon svg path', (p) => p.getAttribute('fill'));
  console.log('detailkop heeft gekleurd icoon:', kop);

  console.log('console errors:', errors);
  await browser.close();
})();
