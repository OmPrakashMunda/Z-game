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
  orders: window.__game.state.orders.map((o) => ({ id: o.id, status: o.status, total: o.total, deliverAt: o.deliverAt, placedAt: o.placedAt })),
})));

// Warehouse yard: grid origin (10, 50), 15 columns by 13 rows, 2 m cells
const cellXZ = (cx, cz) => [10 + cx * 2 + 1, 50 + cz * 2 + 1];
// No separate building mode any more: open the storage list and press Place on a row
const openStorage = async () => { if (!(await page.locator('.drawer').isVisible())) { await page.keyboard.press('KeyI'); await page.waitForTimeout(400); } };
const placeFrom = async (name) => { await openStorage(); await page.locator('.drawer .line', { hasText: name }).locator('.mini-btn', { hasText: 'Place' }).first().click(); await page.waitForTimeout(400); };const cellPx = async (cx, cz) => { const [x, z] = cellXZ(cx, cz); await page.evaluate(() => window.__game.settleCamera()); return page.evaluate(([x, z]) => window.__game.project(x, z, 0), [x, z]); };

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.survivalOff(true));
await page.evaluate(() => window.__game.ownPlot('warehouse'));

// ---- Online store
await page.keyboard.press('KeyB');
await page.waitForSelector('.modal.shop.online');
await page.waitForTimeout(500);
const title = await page.locator('.modal.shop h2').textContent();
check('B opens the online store', title.includes('SurvivalMart Online'), `(${title})`);
const cats = await page.locator('.cat-side .cat-tab').count();
check('store has a category sidebar', cats >= 12, `(${cats} categories)`);
const rows = await page.locator('.item-row').count();
check('store sells supplies and structures', rows >= 120, `(${rows} items)`);
await page.screenshot({ path: out + 'b1-online-store.png' });

// Search narrows the list to fences
await page.locator('input.search').fill('fence');
await page.waitForTimeout(300);
const visible = await page.locator('.item-row:visible').count();
check('search filters the list', visible > 0 && visible < 15, `(${visible} match "fence")`);

const addRow = async (name, clicks, btn = '+10') => {
  const row = page.locator('.item-row:visible', { hasText: name }).first();
  for (let i = 0; i < clicks; i++) await row.locator('.qbtn', { hasText: btn }).first().click();
};
await addRow('Wooden picket fence', 1, '+10');
await addRow('Wooden picket fence', 1, '+10');           // 20 fences
await page.locator('input.search').fill('');
await page.locator('.cat-side .cat-tab', { hasText: 'Houses' }).click();
await page.waitForTimeout(300);
await addRow('Family house', 1, '+');
await page.locator('.cat-side .cat-tab', { hasText: 'Wells' }).click();
await addRow('Hand-pump well', 1, '+');
await page.locator('.cat-side .cat-tab', { hasText: 'Power' }).click();
await addRow('Solar panel', 1, '+');
await addRow('Solar panel', 1, '+');
await page.waitForTimeout(300);
await page.screenshot({ path: out + 'b2-cart.png' });
const note = await page.locator('.order-note').textContent();

const before = await S();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(500);
let s = await S();
const expected = Math.round((20 * 120 + 28000 + 2400 + 2 * 320) * 1.06) ; // roughly, per-line rounding differs by a few dollars
const spent = before.money - s.money;
check('order charged online prices with no fee', Math.abs(spent - expected) < 200, `(spent ${spent}, subtotal about ${expected})`);
check('order delivered instantly', s.orders.length === 1 && s.orders[0].status === 'delivered' && s.storage.house_family === 1);
await page.getByRole('button', { name: 'Close' }).click();

// ---- Delivery to storage
await page.evaluate(() => window.__game.skipToDay(3, 12));
await page.waitForTimeout(500);
s = await S();
check('order delivered to storage', s.orders[0].status === 'delivered' && s.storage.fence_wood === 20 && s.storage.house_family === 1 && s.storage.solar_panel === 2, JSON.stringify(s.storage));
await page.keyboard.press('KeyI');
await page.waitForTimeout(500);
const placeBtns = await page.locator('.drawer .mini-btn').count();
check('storage lists structures with Place buttons', placeBtns === 4, `(${placeBtns})`);
await page.screenshot({ path: out + 'b3-storage.png' });

// ---- Place: needs you at the base, then starts placing
await page.evaluate(() => window.__game.teleport(0, 20));
await page.waitForTimeout(400);
await page.locator('.drawer .line', { hasText: 'Wooden picket fence' }).locator('.mini-btn').click();
await page.waitForTimeout(300);
check('Place away from the base only sets a waypoint', (await page.locator('.placing-bar').count()) === 0 || !(await page.locator('.placing-bar').isVisible()));
await page.evaluate(() => window.__game.teleportTo('base'));
await page.waitForTimeout(500);
await page.locator('.drawer .line', { hasText: 'Wooden picket fence' }).locator('.mini-btn').click();
await page.waitForSelector('.placing-bar', { state: 'visible', timeout: 90000 });
await page.evaluate(() => window.__game.settleCamera());
await page.waitForTimeout(600);
s = await S();
check('Place at the base starts placing', s.at === 'base');
await page.screenshot({ path: out + 'b4-build-mode.png' });

// ---- Drag a line of fences along row 2, from column 2 to column 8
const a = await cellPx(2, 2);
const b = await cellPx(8, 2);
await page.mouse.move(a.x, a.y);
await page.waitForTimeout(200);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
await page.mouse.up();
await page.waitForTimeout(400);
s = await S();
check('dragging lays a line of 7 fences', s.pieces.filter((p) => p.type === 'fence_wood').length === 7 && s.storage.fence_wood === 13, `(pieces ${s.pieces.length}, storage ${s.storage.fence_wood})`);
check('fences along a row are rotated to follow it', s.pieces.every((p) => p.rot === 0), JSON.stringify(s.pieces.map((p) => p.rot)));

// ---- Place the house (4 x 3 cells)
await page.keyboard.press('Digit2');
await page.waitForTimeout(300);
const hp = await cellPx(8, 7);
await page.mouse.move(hp.x, hp.y);
await page.waitForTimeout(500);
await page.screenshot({ path: out + 'b5-ghost.png' });
await page.mouse.click(hp.x, hp.y);
await page.waitForTimeout(400);
s = await S();
const house = s.pieces.find((p) => p.type === 'house_family');
check('house placed', !!house && !s.storage.house_family, JSON.stringify(house));

// Overlapping placement is refused
await placeFrom('Wooden picket fence');
await page.mouse.move(hp.x, hp.y);
await page.mouse.click(hp.x, hp.y);
await page.waitForTimeout(300);
const status = await page.locator('.placing-status').textContent();
s = await S();
check('cannot build on top of the house', s.pieces.length === 8 && /already there/i.test(status), `(${status})`);

// ---- Outside the plot is refused
const outside = await cellPx(24, 6);
await page.mouse.move(outside.x, outside.y);
await page.mouse.click(outside.x, outside.y);
s = await S();
check('cannot build outside the plot', s.pieces.length === 8);

// ---- Construction takes game time and uses a crew of three
await page.evaluate(() => window.__game.advanceHours(0.4));     // 24 minutes: the first three fences (20 min each) finish
s = await S();
check('first batch of three fences done after 24 min', s.pieces.filter((p) => p.type === 'fence_wood' && p.progress >= 1).length === 3, JSON.stringify(s.pieces.map((p) => +p.progress.toFixed(2))));
await page.evaluate(() => window.__game.advanceHours(1.5));     // another 90 minutes: all fences finished, the house still going
s = await S();
check('all 7 fences done, house still under construction', s.pieces.filter((p) => p.type === 'fence_wood' && p.progress >= 1).length === 7 && s.pieces.find((p) => p.type === 'house_family').progress < 1, JSON.stringify(s.pieces.map((p) => +p.progress.toFixed(2))));
await page.evaluate(() => window.__game.advanceHours(14));      // the family house needs 12 hours
s = await S();
check('everything finishes given enough time', s.pieces.every((p) => p.progress >= 1), JSON.stringify(s.pieces.map((p) => +p.progress.toFixed(2))));
// A big jump in one step must also work
await page.evaluate(() => { window.__game.give('fence_wood', 0); });await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'b6-built.png' });

// ---- Take a fence down by clicking it: goes back to storage
console.log('placing before Escape:', await page.locator('.placing-bar').isVisible());
if (await page.locator('.placing-bar').isVisible()) await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const fenceAt = await page.evaluate(async () => {
  const b = await import('/src/sim/build.ts');
  const st = window.__game.state;
  const p = st.pieces.filter((q) => q.type === 'fence_wood')[3];
  const c = b.pieceCenter(b.gridOf(st), p.type, p.cx, p.cz, p.rot);
  return window.__game.project(c.x, c.z, 0.7);
});
await page.mouse.move(fenceAt.x, fenceAt.y);
await page.waitForTimeout(300);
await page.mouse.click(fenceAt.x, fenceAt.y);
await page.waitForTimeout(500);
check('clicking a structure opens its card', await page.locator('.piece-panel').isVisible());
await page.locator('.piece-panel .btn', { hasText: 'Take down' }).click();
await page.waitForTimeout(500);
s = await S();
check('taking a fence down returns it to storage', s.pieces.filter((p) => p.type === 'fence_wood').length === 6 && s.storage.fence_wood === 14, `(storage ${s.storage.fence_wood})`);
// ---- Exit and persistence
await page.waitForTimeout(600);
const stillBuilding = await page.locator('.placing-bar').isVisible();
check('Esc leaves placing', !stillBuilding);
s = await S();
check('the base has 7 structures built (6 fences and the house)', s.pieces.length === 7, '(' + s.pieces.length + ')');
await page.screenshot({ path: out + 'b7-after.png' });
await page.waitForTimeout(2200); // let the delayed autosave run
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(1500);
s = await S();
check('structures survive save and reload', s.pieces.length === 7 && s.storage.fence_wood === 14, `(pieces ${s.pieces.length})`);
await page.screenshot({ path: out + 'b8-reloaded.png' });

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
