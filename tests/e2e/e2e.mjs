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

const S = () => page.evaluate(() => JSON.parse(JSON.stringify({
  ws: window.__game.state.worldSeconds, money: window.__game.state.money, at: window.__game.state.at,
  plot: window.__game.state.plotId, storage: window.__game.state.storage, phase: window.__game.state.phase,
  orders: window.__game.state.orders.map((o) => ({ id: o.id, status: o.status, total: o.total })),
})));
const P = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.player())));
const goAndEnter = async (place) => {
  await page.evaluate((p) => window.__game.teleportTo(p), place);
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
};
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const clickAt = async (x, z, h = 3) => {
  await page.waitForTimeout(700); // let the camera settle
  const p = await page.evaluate(([x, z, h]) => window.__game.project(x, z, h), [x, z, h]);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
};
const shot = (name) => page.screenshot({ path: out + name });

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(1500);
await page.getByText('New Game').click();
await page.waitForTimeout(700);
await page.evaluate(() => window.__game.survivalOff(true));
await page.waitForTimeout(1500);
await shot('m1-start.png');

await page.mouse.move(640, 400); for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
await page.waitForTimeout(800);
let s = await S();
check('starts at motel with $500,000', s.at === 'motel' && s.money === 500000);

// --- Click Hillside Realty on the map
await page.evaluate(() => { window.__game.snapCamera(47, -14); window.__game.settleCamera(); });
await clickAt(47, -14, 3);
await page.waitForTimeout(400);
const panelTitle = await page.locator('.place-panel h2').textContent();
check('clicking the realty opens its panel', panelTitle === 'Hillside Realty', `(${panelTitle})`);
await shot('m2-place-panel.png');

check('the panel says how far away it is', /\d+ m away/.test(await page.locator('.place-panel .dim').first().textContent()));
check('there is no instant travel button any more', (await page.getByRole('button', { name: /Travel/ }).count()) === 0);
await page.getByRole('button', { name: /Set waypoint/ }).click();
await page.waitForTimeout(400);
check('the waypoint shows in the top bar', await page.locator('.hud .waypoint').isVisible());
const p0 = await P();
await page.keyboard.down('KeyD');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyD');
const p1 = await P();
check('WASD walks the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, `(${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m)`);
await page.evaluate(() => window.__game.teleportTo('real_estate'));
await page.waitForTimeout(500);
const pr = await P();
check('standing at the door offers to enter', pr.at === 'real_estate' && /Hillside Realty/.test(pr.prompt ?? ''), JSON.stringify(pr.prompt));
await page.keyboard.press('Space');
await page.waitForSelector('.modal.realty', { timeout: 20000 });
s = await S();
check('arrived at realty', s.at === 'real_estate');
await shot('m4-realty.png');

// --- Buy the warehouse plot (two-step confirm)
const card = page.locator('.plot-card', { hasText: 'Warehouse Yard' });
await card.getByRole('button', { name: 'Buy this plot' }).click();
await card.getByRole('button', { name: /Click again/ }).click();
await page.waitForTimeout(500);
s = await S();
check('bought warehouse plot for $180,000', s.plot === 'warehouse' && s.money === 320000, `(money ${s.money})`);
await shot('m5-bought.png');
await page.getByRole('button', { name: 'Leave' }).click();

// --- Shop at the hardware store
await goAndEnter('hardware');
await page.waitForSelector('.modal.shop', { timeout: 120000 });
await page.waitForTimeout(400);
check('at hardware store', (await S()).at === 'hardware');
const add = async (name, clicks) => {
  const row = page.locator('.item-row', { hasText: name }).first();
  for (let i = 0; i < clicks; i++) await row.locator('.qbtn.wide').click();
};
await add('Lumber', 1);
await page.locator('.item-row', { hasText: 'Shipping container, 20 ft' }).locator('.qbtn', { hasText: '+' }).first().click();
await page.locator('.item-row', { hasText: 'Shipping container, 20 ft' }).locator('.qbtn', { hasText: '+' }).first().click();
await shot('m6-shop-cart.png');
const moneyBefore = (await S()).money;
const noteBefore = await page.locator('.order-note').textContent();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(500);
s = await S();
const spent = moneyBefore - s.money;
// 10 lumber at 180 + 2 containers at 4800 = 1800 + 9600 = 11400, fee 40 + 2% = 268
check('order charged the items only (no delivery fee)', spent === 11400, `(spent ${spent}; note: ${noteBefore})`);
check('order was delivered instantly', s.orders.length === 1 && s.orders[0].status === 'delivered' && s.storage.lumber === 10);
await page.keyboard.press('KeyO');
await shot('m7-orders-drawer.png');
await page.keyboard.press('KeyO');

// --- Insufficient money is blocked
await page.evaluate(() => window.__game.setMoney(100));
await page.locator('.item-row', { hasText: 'Shipping container, 20 ft' }).locator('.qbtn', { hasText: '+' }).first().click();
await page.waitForTimeout(300);
check('cannot order without enough money', await page.getByRole('button', { name: 'Buy now' }).isDisabled());
await page.getByRole('button', { name: 'Clear cart' }).click();
await page.evaluate(() => window.__game.setMoney(300000));

// --- Delivery after the delay
await page.getByRole('button', { name: 'Close' }).click();
await page.evaluate(() => window.__game.skipToDay(1, 23));
await page.waitForTimeout(500);
s = await S();
check('order delivered to base storage', s.orders[0].status === 'delivered' && s.storage.container_20 === 2 && s.storage.lumber === 10, JSON.stringify(s.storage));
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
await shot('m8-storage.png');
await page.keyboard.press('KeyI');

// --- Panic prices late in the game
await page.evaluate(() => window.__game.skipToDay(28, 12));
await goAndEnter('supermarket');
await page.waitForSelector('.modal.shop', { timeout: 120000 });
await page.waitForTimeout(500);
const foodRow = page.locator('.item-row', { hasText: 'Canned food' });
const foodText = await foodRow.textContent();
check('panic raises prices and cuts stock on day 28', /\d+%/.test(foodText) && (await foodRow.locator('.badge svg').count()) === 1, `(${foodText.replace(/\s+/g, ' ').trim()})`);
await shot('m9-panic-shop.png');
await page.getByRole('button', { name: 'Close' }).click();

// --- Outbreak closes shops and refunds orders
await page.evaluate(() => { window.__game.state.money = 300000; });
await page.evaluate(() => window.__game.skipToDay(29, 20));
// place an order that can't arrive before day 30 (vehicle dealer: 24 h)
await goAndEnter('vehicle_dealer');
await page.waitForSelector('.modal.shop', { timeout: 120000 });
await page.locator('.item-row', { hasText: 'Utility trailer' }).locator('.qbtn', { hasText: '+' }).first().click();
const before = (await S()).money;
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(300);
const afterOrder = (await S()).money;
await page.getByRole('button', { name: 'Close' }).click();
await page.evaluate(() => window.__game.skipToDay(30, 9));
await page.waitForTimeout(600);
s = await S();
check('outbreak started', s.phase === 'outbreak');
check('late orders are delivered instantly, so nothing needs refunding', s.money === afterOrder && s.storage.trailer === 1, JSON.stringify(s.storage));
await page.keyboard.press('KeyN');
await page.waitForTimeout(400);
await shot('m10-outbreak-news.png');

// --- Save and resume
await page.keyboard.press('KeyN');
for (let i = 0; i < 4 && !(await page.getByText('Save game').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
await page.getByText('Save game').click();
await page.waitForTimeout(500);
const savedWs = (await S()).ws;
await page.reload();
await page.waitForTimeout(1800);
await page.getByText('Continue').click();
await page.waitForTimeout(800);
s = await S();
check('saved game resumes (plot, storage, phase, time)', s.plot === 'warehouse' && s.storage.container_20 === 2 && s.phase === 'outbreak' && Math.abs(s.ws - savedWs) < 120, `(saved ${savedWs}, resumed ${s.ws})`);
await shot('m11-resumed.png');

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
