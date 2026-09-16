const { chromium } = require('playwright');
const { start } = require('./pwa-update-server');

const BASE = 'http://localhost:8799';
const server = start();

async function marker(page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--test-marker').trim()
  );
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // --- Fase 1: eerste installatie ---
  await page.goto(BASE + '/#/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
  await page.waitForTimeout(600);

  // Levenscyclus van de service worker meelezen.
  await page.evaluate(() => {
    window.__sw = [];
    navigator.serviceWorker.addEventListener('controllerchange', () => window.__sw.push('controllerchange'));
    navigator.serviceWorker.getRegistration().then((r) => {
      r.addEventListener('updatefound', () => {
        window.__sw.push('updatefound');
        const w = r.installing;
        if (w) w.addEventListener('statechange', () => window.__sw.push('nieuwe worker -> ' + w.state));
      });
    });
  });

  console.log('fase 1 -- CSS-marker:', await marker(page));
  console.log('fase 1 -- door SW bestuurd:', await page.evaluate(() => !!navigator.serviceWorker.controller));

  // Vlag op window: overleeft een herlaad niet, dus hiermee meten we of de
  // pagina daadwerkelijk opnieuw geladen is.
  await page.evaluate(() => { window.__voorUpdate = true; });

  // --- Fase 2: "deploy" ---
  await fetch(BASE + '/__setversion?v=versie-twee&css=TWEE');
  console.log('\n-- nieuwe versie gedeployed (sw.js en style.css gewijzigd) --\n');

  // --- Fase 3: app hervatten, zoals een PWA die uit de achtergrond komt ---
  // Geen navigatie: precies het geval waarin de webapp bleef hangen.
  // Een echte hervatting ligt altijd ruim na het laden; even voorbij de
  // burst-drempel wachten zodat dit die situatie nabootst.
  await page.waitForTimeout(3500);
  const hitsVoor = await (await fetch(BASE + '/__swhits')).text();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(1500);
  const hitsNa = await (await fetch(BASE + '/__swhits')).text();
  console.log(`sw.js opgehaald: ${hitsVoor} -> ${hitsNa} (update-check ${hitsNa > hitsVoor ? 'ging af' : 'GING NIET AF'})`);
  console.log('SW-gebeurtenissen:', JSON.stringify(await page.evaluate(() => window.__sw)));
  console.log('SW-status:', JSON.stringify(await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { installing: !!r.installing, waiting: !!r.waiting, active: !!r.active };
  })));

  // Zichtbaar: er mag NU juist niet herladen worden.
  await page.waitForTimeout(4000);
  const zichtbaarHerladen = await page.evaluate(() => window.__voorUpdate === undefined);
  console.log('herlaadt terwijl app in beeld is:', zichtbaarHerladen ? 'JA (fout: zichtbare knipper)' : 'nee');

  // App naar de achtergrond -> nu mag het wel.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  let herladen = false;
  try {
    await page.waitForFunction(() => window.__voorUpdate === undefined, { timeout: 15000 });
    herladen = true;
  } catch (err) {
    herladen = false;
  }
  await page.waitForTimeout(800);

  console.log('pagina automatisch herladen:', herladen ? 'ja' : 'NEE');
  console.log('fase 3 -- CSS-marker:', await marker(page));
  console.log('fase 3 -- lijst zichtbaar:', await page.$$eval('.list-card-row', (r) => r.length), 'rij(en)');
  console.log('console errors:', errors.length ? errors : 'geen');

  // --- Fase 4: nog een hervatting zonder deploy mag NIET herladen ---
  await page.evaluate(() => { window.__naUpdate = true; });
  await page.waitForTimeout(5000); // voorbij de throttle
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(3000);
  const nogSteedsDaar = await page.evaluate(() => window.__naUpdate === true);
  console.log('\nzonder nieuwe versie geen onnodige herlaad:', nogSteedsDaar ? 'ja' : 'NEE (herlaadt te vaak!)');

  await browser.close();
  server.close();
})();
