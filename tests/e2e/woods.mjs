import { chromium } from 'playwright-core';

const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const S = () => page.evaluate(() => JSON.parse(JSON.stringify({ at: window.__game.state.at, plot: window.__game.state.plotId, money: window.__game.state.money, ws: window.__game.state.worldSeconds })));

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(700);
await page.evaluate(() => window.__game.survivalOff(true));
await page.waitForTimeout(1200);

// Put the player at the realty, open it, and look at the four plots
await page.evaluate(() => { window.__game.state.at = 'real_estate'; window.__game.snapCamera(47, -14); });
await page.mouse.move(640, 400);
for (let i = 0; i < 2; i++) await page.mouse.wheel(0, 300);
await page.waitForTimeout(1200);
const p = await page.evaluate(() => window.__game.project(47, -14, 3));
await page.mouse.click(p.x, p.y);
await page.getByRole('button', { name: /Enter office/ }).click();
await page.waitForSelector('.modal.realty');
await page.waitForTimeout(500);
const plotCount = await page.locator('.plot-card').count();
check('realty offers four plots', plotCount === 4, `(${plotCount})`);
await page.screenshot({ path: out + 'r1-realty.png' });

// Buy the woods plot
const woods = page.locator('.plot-card', { hasText: 'Deep Woods Clearing' });
await woods.scrollIntoViewIfNeeded();
await woods.getByRole('button', { name: 'Buy this plot' }).click();
await woods.getByRole('button', { name: /Click again/ }).click();
await page.waitForTimeout(500);
let s = await S();
check('bought woods plot for $95,000', s.plot === 'woods' && s.money === 405000, `(${JSON.stringify(s)})`);
await page.getByRole('button', { name: 'Leave' }).click();

// Travel to the woods base: it is far away, so it should take a while
await page.evaluate(() => window.__game.snapCamera(150, -34));
await page.waitForTimeout(900);
const wp = await page.evaluate(() => window.__game.project(160, -38, 0));
await page.mouse.move(wp.x, wp.y);
await page.waitForTimeout(300);
await page.mouse.click(wp.x, wp.y);
await page.waitForTimeout(500);
const title = await page.locator('.place-panel h2').textContent();
check('clicking the woods plot opens its panel', title === 'Deep Woods Clearing', `(${title})`);
const btn = await page.getByRole('button', { name: /^Go to base \(/ }).textContent();
const mins = Number((btn.match(/\((\d+) min\)/) || [])[1]);
check('woods base is a long trip from the realty', mins >= 25, `(${btn})`);
await page.screenshot({ path: out + 'r2-woods-panel.png' });
const t0 = (await S()).ws;
await page.getByRole('button', { name: /^Go to base \(/ }).click();
await page.waitForFunction(() => window.__game.state.at === 'base', null, { timeout: 120000 });
s = await S();
check('travel to the woods base took game time', Math.abs((s.ws - t0) / 60 - mins) < 8, `(${((s.ws - t0) / 60).toFixed(1)} min)`);
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'r3-at-base.png' });

// Icons on the shop
await page.evaluate(() => { window.__game.state.at = 'supermarket'; window.__game.snapCamera(-40, -17); });
await page.waitForTimeout(900);
const sp = await page.evaluate(() => window.__game.project(-40, -17, 3));
await page.mouse.click(sp.x, sp.y);
await page.getByRole('button', { name: /Enter shop/ }).click();
await page.waitForSelector('.modal.shop');
await page.waitForTimeout(400);
const svgCount = await page.locator('.item-row svg').count();
check('shop rows use SVG icons', svgCount >= 16, `(${svgCount})`);
await page.screenshot({ path: out + 'r4-shop-icons.png' });
await page.getByRole('button', { name: 'Close' }).click();
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'r5-storage.png' });

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
