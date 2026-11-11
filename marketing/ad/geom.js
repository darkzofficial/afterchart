// Records on-screen positions (CSS px, 390-wide phone) of elements the ad animates over.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const rect = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }, sel);
  const g = {};
  await p.goto('http://localhost:3000/login');
  await p.fill('#identifier', 'jaytrades'); await p.fill('#password', 'demo-password-1'); await p.click('button[type=submit]');
  await p.waitForSelector('.cal-grid'); await p.click('[data-nav="-1"]'); await p.waitForTimeout(200);
  await p.addStyleTag({ content: '.nav{position:relative!important}' });
  g.cal = await rect('#cal'); g.equity = await rect('.chart-card'); g.stats = await rect('.stats'); g.netpnl = await rect('.hero-stat');
  g.cells = await p.evaluate(() => [...document.querySelectorAll('.cal-cell[data-day]')].map((c) => {
    const r = c.getBoundingClientRect(); return { day: c.dataset.day, tone: c.classList.contains('win') ? 'win' : c.classList.contains('loss') ? 'loss' : '', x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }));
  await p.click('[data-day="2026-10-29"]'); await p.waitForTimeout(400);
  g.addBtn = await p.evaluate(() => { const r = document.querySelector('#day-add').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.keyboard.press('Escape'); await p.evaluate(() => scrollTo(0, 0));
  await p.fill('#search-input', '@ma'); await p.waitForTimeout(600);
  g.search = await rect('#search-input');
  g.maya = await p.evaluate(() => { const r = [...document.querySelectorAll('.sr-item')].find((a) => a.href.endsWith('maya_fx')).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  require('fs').writeFileSync(__dirname + '/shots/geom.json', JSON.stringify(g, null, 1));
  console.log(JSON.stringify({ cal: g.cal, addBtn: g.addBtn, search: g.search, maya: g.maya, cells: g.cells.length }));
  await b.close();
})();
