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
const S = () => page.evaluate(() => JSON.parse(JSON.stringify({
  ws: window.__game.state.worldSeconds, money: window.__game.state.money, at: window.__game.state.at,
  plot: window.__game.state.plotId, storage: window.__game.state.storage, pieces: window.__game.state.pieces,
  expansion: window.__game.state.expansion, orders: window.__game.state.orders.map((o) => ({ id: o.id, status: o.status, total: o.total })),
})));
// Warehouse yard: grid origin (10, 50), 15 columns by 13 rows, 2 m cells
// No separate building mode any more: open the storage list and press Place on a row
const openStorage = async () => { if (!(await page.locator('.drawer').isVisible())) { await page.keyboard.press('KeyI'); await page.waitForTimeout(400); } };
const placeFrom = async (name) => { await openStorage(); await page.locator('.drawer .line', { hasText: name }).locator('.mini-btn', { hasText: 'Place' }).first().click(); await page.waitForTimeout(400); };const cellPx = async (cx, cz) => {
  await page.evaluate(() => window.__game.settleCamera());
  return page.evaluate(([x, z]) => window.__game.project(x, z, 0), [10 + cx * 2 + 1, 50 + cz * 2 + 1]);
};
const addRow = async (name, clicks, btn = '+') => {
  const row = page.locator('.item-row:visible', { hasText: name }).first();
  for (let i = 0; i < clicks; i++) await row.locator('.qbtn', { hasText: btn }).first().click();
};
const money = (txt) => Number(txt.replace(/[^0-9]/g, ''));

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.survivalOff(true));
await page.evaluate(() => window.__game.ownPlot('warehouse'));

// ---- Online store: opens on building products, with pictures
await page.keyboard.press('KeyB');
await page.waitForSelector('.modal.shop.online');
await page.waitForTimeout(600);
const active = await page.locator('.cat-side .cat-tab.active').textContent();
check('online store opens on a building category', /Fences/.test(active), `(${active})`);
const banner = await page.locator('.modal.shop .banner').first().textContent();
check('banner promises instant delivery', /Instant delivery/i.test(banner), `(${banner})`);
await page.waitForFunction(() => document.querySelectorAll('.item-row .thumb img[src^="data:image"]').length >= 5, null, { timeout: 120000 });
const pics = await page.locator('.item-row .thumb img[src^="data:image"]').count();
check('products show picture previews', pics >= 5, `(${pics} pictures loaded)`);
await page.screenshot({ path: out + 'l1-store-fences.png' });

// ---- Ponds, trees and paths exist in the store
await page.locator('.cat-side .cat-tab', { hasText: 'Ponds, trees and paths' }).click();
await page.waitForTimeout(400);
const landscapeRows = await page.locator('.item-row:visible').count();
check('landscaping category has ponds, trees and paths', landscapeRows >= 14, `(${landscapeRows} products)`);
await addRow('Small pond', 1);
await addRow('Oak tree', 2);
await addRow('Gravel path', 1, '+10');
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'l2-store-landscape.png' });
const totalTxt = await page.locator('.totals .total').textContent();
check('no delivery fee line any more', (await page.locator('.totals', { hasText: 'Delivery fee' }).count()) === 0);

// ---- Instant delivery
const before = await S();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(500);
let s = await S();
const spent = before.money - s.money;
check('paid exactly the total shown', spent === money(totalTxt), `(spent ${spent}, shown ${totalTxt})`);
check('items are in storage straight away', s.storage.pond_small === 1 && s.storage.tree_oak === 2 && s.storage.path_gravel === 10, JSON.stringify(s.storage));
check('order is recorded as delivered, not in transit', s.orders.length === 1 && s.orders[0].status === 'delivered');
check('game clock barely moved (no waiting)', s.ws - before.ws < 600, `(${((s.ws - before.ws) / 60).toFixed(1)} game min)`);

// Also buy some fences in the same session
await page.locator('.cat-side .cat-tab', { hasText: 'Fences' }).click();
await addRow('Chain-link fence', 1, '+10');
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(300);

// ---- Go build with it
await page.getByRole('button', { name: 'Go build with it' }).click();
await page.waitForSelector('.drawer', { state: 'visible', timeout: 20000 });
await page.locator('.drawer .line', { hasText: 'Small pond' }).locator('.mini-btn', { hasText: 'Place' }).first().click();
await page.waitForSelector('.placing-bar', { state: 'visible', timeout: 120000 });
await page.evaluate(() => window.__game.settleCamera());
await page.waitForTimeout(600);
s = await S();
check('Placing from storage travels to the base', s.at === 'base');
const chipImgs = await page.locator('.drawer .thumb, .drawer img, .drawer canvas').count();
check('the storage list shows pictures of stored structures', chipImgs >= 3, '(' + chipImgs + ')');
await page.screenshot({ path: out + 'l3-build-bar.png' });

// ---- Place a pond, trees and a path
let c = await cellPx(4, 4);
await page.mouse.move(c.x, c.y);
await page.mouse.click(c.x, c.y);
await placeFrom('Oak tree');
c = await cellPx(9, 3);
await page.mouse.move(c.x, c.y);
await page.mouse.click(c.x, c.y);
c = await cellPx(10, 5);
await page.mouse.move(c.x, c.y);
await page.mouse.click(c.x, c.y);
await placeFrom('Gravel path');
const a = await cellPx(2, 9);
const b = await cellPx(8, 9);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
await page.mouse.up();
await page.waitForTimeout(400);
s = await S();
check('pond placed', s.pieces.some((p) => p.type === 'pond_small'));
check('two trees placed', s.pieces.filter((p) => p.type === 'tree_oak').length === 2);
check('dragging lays a gravel path', s.pieces.filter((p) => p.type === 'path_gravel').length === 7, `(${s.pieces.filter((p) => p.type === 'path_gravel').length} tiles)`);
await page.evaluate(() => window.__game.advanceHours(4));
await page.waitForTimeout(1200);
await page.screenshot({ path: out + 'l4-landscaped.png' });

// ---- Buy more land
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const plotSpot = await cellPx(13, 11);
await page.mouse.move(plotSpot.x, plotSpot.y);
await page.mouse.click(plotSpot.x, plotSpot.y);
await page.waitForTimeout(600);
await page.locator('.place-panel .btn', { hasText: 'Buy more land' }).first().click();
await page.waitForSelector('.expand-panel', { state: 'visible' });
await page.waitForTimeout(400);
const rows = await page.locator('.expand-row').count();
check('land panel offers four sides', rows === 4, `(${rows})`);
const blocked = await page.locator('.expand-row.blocked').count();
check('sides blocked by roads are marked unavailable', blocked >= 2, `(${blocked} blocked)`);
await page.screenshot({ path: out + 'l5-expand-panel.png' });
// A tile east of the plot cannot be built yet
const outside = await cellPx(17, 3);
await page.mouse.move(outside.x, outside.y);
await page.waitForTimeout(300);
// The east edge (down-right on screen) is the third row after the intro: n, e, s, w
const eastRow = page.locator('.expand-row').nth(1);
const priceTxt = await eastRow.locator('button').textContent();
const moneyBefore = (await S()).money;
await eastRow.locator('button').click();
await page.waitForTimeout(500);
s = await S();
check('buying the east strip adds one expansion', s.expansion.e === 1, JSON.stringify(s.expansion));
check('land was charged at the listed price', moneyBefore - s.money === money(priceTxt), `(charged ${moneyBefore - s.money}, listed ${priceTxt})`);
await page.locator('.expand-panel .x').click();

// Now a tree fits on the new land
await page.evaluate(() => window.__game.give('tree_pine', 1));
await page.evaluate(() => window.__game.state && window.dispatchEvent(new Event('resize')));
await page.waitForTimeout(800);
await placeFrom('Pine tree');
const east = await cellPx(17, 3);
await page.mouse.move(east.x, east.y);
await page.mouse.click(east.x, east.y);
await page.waitForTimeout(400);
s = await S();
check('can build on the newly bought land', s.pieces.some((p) => p.type === 'tree_pine' && p.cx === 17), JSON.stringify(s.pieces.find((p) => p.type === 'tree_pine')));
await page.waitForTimeout(1200);
await page.screenshot({ path: out + 'l6-expanded.png' });

// ---- Saving keeps the land
await page.keyboard.press('Escape');
await page.waitForTimeout(2200);
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(1500);
s = await S();
check('expanded land and structures survive a reload', s.expansion.e === 1 && s.pieces.length >= 11, `(${s.pieces.length} pieces, expansion ${JSON.stringify(s.expansion)})`);

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
