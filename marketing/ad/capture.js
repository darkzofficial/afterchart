// Captures real Afterchart screens (iPhone 13, 3x) from a local demo instance for the ad.
const { chromium, devices } = require('playwright');
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:3000';
const fixBg = `.nav{position:relative!important} .bg{position:absolute!important;height:var(--h)!important} #toast{display:none!important} *{caret-color:transparent!important}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const settle = (ms = 500) => p.waitForTimeout(ms);
  const full = async (name) => {
    await p.addStyleTag({ content: fixBg });
    await p.evaluate(() => document.documentElement.style.setProperty('--h', document.documentElement.scrollHeight + 'px'));
    await p.screenshot({ path: OUT + name, fullPage: true });
  };
  await p.goto(BASE + '/'); await settle(800);
  await p.screenshot({ path: OUT + 'landing.png' });
  await p.goto(BASE + '/login');
  await p.fill('#identifier', 'jaytrades'); await p.fill('#password', 'demo-password-1');
  await p.screenshot({ path: OUT + 'login.png' });
  await p.click('button[type=submit]'); await p.waitForSelector('.cal-grid'); await settle(400);
  await p.click('[data-nav="-1"]'); await settle(200);           // October: a full month
  await full('dashboard_full.png');
  // geometry of the calendar card within the full page, for zooms
  const calBox = await p.evaluate(() => { const r = document.querySelector('#cal').getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; });
  const eqBox = await p.evaluate(() => { const r = document.querySelector('.chart-card').getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; });
  require('fs').writeFileSync(OUT + 'geom.json', JSON.stringify({ calBox, eqBox }));
  // best green day in October
  const best = await p.evaluate(() => {
    let bestK = null, bestV = -1e9;
    document.querySelectorAll('.cal-cell.win').forEach((c) => {
      const v = parseFloat(c.querySelector('.cal-p').textContent.replace(/[^0-9.\-−]/g, '').replace('−', '-'));
      if (v > bestV) { bestV = v; bestK = c.dataset.day; }
    }); return bestK;
  });
  await p.locator(`[data-day="${best}"]`).scrollIntoViewIfNeeded();
  await p.click(`[data-day="${best}"]`); await settle(500);
  await p.screenshot({ path: OUT + 'day.png' });
  await p.click('#day-add'); await settle(300);
  await p.fill('#symbol', 'NVDA'); await p.fill('#quantity', '50'); await p.fill('#entry_price', '131.40'); await p.fill('#exit_price', '137.85');
  await p.fill('#fees', '2'); await p.fill('#notes', 'Opening range breakout. Took partials at 2R.');
  await p.locator('#symbol').blur(); await settle(300);
  await p.screenshot({ path: OUT + 'trade_form.png' });
  await p.keyboard.press('Escape'); await settle(200); await p.keyboard.press('Escape');
  await p.evaluate(() => window.scrollTo(0, 0)); await settle(200);
  for (const [i, q] of ['', '@', '@m', '@ma'].entries()) {
    if (q) { await p.fill('#search-input', q); await settle(600); } else { await p.click('#search-input'); await settle(150); }
    await p.screenshot({ path: OUT + `search_${i}.png` });
  }
  await p.goto(BASE + '/u/maya_fx'); await p.waitForSelector('.cal-grid'); await settle(600);
  await full('profile_full.png');
  await p.goto(BASE + '/u/jaytrades'); await p.waitForSelector('.cal-grid'); await settle(600);
  await p.screenshot({ path: OUT + 'myprofile.png' });
  await b.close();
  console.log('best day', best, calBox, eqBox);
})();
