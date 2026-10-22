const { chromium } = require('playwright');
const exe = 'C:/Users/hp/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const base = 'https://noeljaywolf-create.github.io/mine-os';
const routes = ['/', '/app', '/app/digital-twin', '/app/dewatering', '/app/impact', '/app/forecast', '/app/decisions', '/app/governance'];

(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  for (const route of routes) {
    errors.length = 0;
    const res = await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const text = (await page.locator('body').innerText()).trim();
    console.log(`${errors.length || text.length < 50 ? 'FAIL' : 'OK  '} ${route} http=${res.status()} chars=${text.length}`);
    for (const e of [...new Set(errors)].slice(0, 3)) console.log('   ', e);
  }
  await page.goto(base + '/app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'C:/Users/hp/AppData/Local/Temp/opencode/live-mission.png' });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/hp/AppData/Local/Temp/opencode/live-landing.png' });
  await browser.close();
})().catch((e) => { console.error('LIVE FAILED', e); process.exit(1); });
