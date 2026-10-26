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

// Walk to the realty door and go in
await page.evaluate(() => window.__game.teleportTo('real_estate'));
await page.waitForTimeout(800);
await page.keyboard.press('Space');
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

// The woods base is a long walk from the realty
await page.evaluate(() => window.__game.snapCamera(150, -34));
await page.waitForTimeout(900);
const wp = await page.evaluate(() => window.__game.project(160, -38, 0));
await page.mouse.move(wp.x, wp.y);
await page.waitForTimeout(300);
await page.mouse.click(wp.x, wp.y);
await page.waitForTimeout(500);
const title = await page.locator('.place-panel h2').textContent();
check('clicking the woods plot opens its panel', title === 'Deep Woods Clearing', `(${title})`);
const here = await page.evaluate(() => window.__game.player());
const far = Math.hypot(here.x - 160, here.z + 38);
check('woods base is a long walk from the realty', far > 100, `(${far.toFixed(0)} m)`);
await page.getByRole('button', { name: /^Set waypoint to base/ }).click();
await page.waitForTimeout(300);
check('a waypoint marks the way', (await page.evaluate(() => window.__game.player().waypoint)) !== null);
await page.screenshot({ path: out + 'r2-woods-panel.png' });
await page.evaluate(() => window.__game.teleportTo('base'));
await page.waitForTimeout(500);
s = await S();
check('standing on the land counts as being at the base', s.at === 'base');
await page.waitForTimeout(1500);await page.screenshot({ path: out + 'r3-at-base.png' });

// Icons on the shop
await page.evaluate(() => window.__game.teleportTo('supermarket'));
await page.waitForTimeout(800);
await page.keyboard.press('Space');
await page.waitForSelector('.modal.shop');
await page.waitForTimeout(400);const svgCount = await page.locator('.item-row svg').count();
check('shop rows use SVG icons', svgCount >= 16, `(${svgCount})`);
await page.screenshot({ path: out + 'r4-shop-icons.png' });
await page.getByRole('button', { name: 'Close' }).click();
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'r5-storage.png' });

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
