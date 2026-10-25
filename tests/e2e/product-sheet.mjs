import { chromium } from 'playwright-core';
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const PORT = process.env.PORT;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[error] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const G = (fn, arg) => page.evaluate(fn, arg);

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1200);
await G(() => { window.__game.survivalOff(true); window.__game.ownPlot('warehouse'); window.__game.state.at = 'base'; });
await page.keyboard.press('KeyB');
await page.waitForSelector('.item-row', { state: 'attached', timeout: 20000 });

// ---- Opening and closing
const sheetVisible = () => page.locator('.sheet').isVisible();
check('the sheet starts closed', !(await sheetVisible()));
await page.locator('.item-row').first().click();
await page.waitForTimeout(400);
check('clicking a product opens its sheet', await sheetVisible());
const name0 = await page.locator('.sheet-name').innerText();
const firstRow = await page.locator('.item-row .item-name').first().innerText();
check('the sheet is about that product', name0.toLowerCase() === firstRow.trim().toLowerCase(), `(${name0})`);
for (const section of ['What it is', 'How it works', 'The numbers']) {
  check(`it has a "${section}" section`, (await page.locator('.sheet-section h4', { hasText: new RegExp(section, 'i') }).count()) === 1);
}
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc closes only the sheet', !(await sheetVisible()) && (await page.locator('.modal.shop').isVisible()));

// ---- Buying from the sheet
await page.locator('.item-row').first().click();
await page.waitForTimeout(300);
await page.locator('.sheet .qbtn.wide').click();
await page.locator('.sheet .qbtn', { hasText: '+' }).first().click().catch(() => {});
await page.waitForTimeout(300);
const qtyOnSheet = Number(await page.locator('.sheet input.qty').inputValue());
await page.getByText('Back to the list').click();
await page.waitForTimeout(300);
const qtyInRow = Number(await page.locator('.item-row input.qty').first().inputValue());
check('buttons on the sheet change the order', qtyOnSheet >= 10 && qtyOnSheet === qtyInRow, `(sheet ${qtyOnSheet}, row ${qtyInRow})`);
check('the order total on the right updates', (await page.locator('.totals .total').innerText()).includes('$'));

// ---- Content of chosen products
const sample = {};
async function read(id) {
  await G((i) => window.__game.showProduct(i), id);
  await page.waitForTimeout(250);
  return {
    name: await page.locator('.sheet-name').innerText(),
    tag: await page.locator('.sheet-tag').innerText(),
    text: await page.locator('.sheet').innerText(),
    stats: await page.locator('.sheet-stat').allInnerTexts(),
    needs: await page.locator('.sheet-need').allInnerTexts(),
  };
}
for (const id of ['well_hand', 'solar_panel', 'garden_bed', 'generator_5kw', 'water_tank', 'fence_wood', 'canned_food', 'gasoline', 'pistol', 'tree_pine']) sample[id] = await read(id);
const has = (id, re) => re.test(sample[id].text.replace(/\s+/g, ' '));
check('well: makes 288 L a day and needs no power', has('well_hand', /288 L/) && has('well_hand', /no power/i));
check('solar panel: 0.35 kW, nothing at night', has('solar_panel', /0\.35 kW/) && has('solar_panel', /nothing at night/i));
check('garden bed: lists seeds and a water link as needs', sample.garden_bed.needs.length === 2, JSON.stringify(sample.garden_bed.needs).slice(0, 160));
check('generator: lists fuel as a need and shows the burn rate', sample.generator_5kw.needs.some((n) => /gasoline/i.test(n)) && has('generator_5kw', /1\.8 L\/h/));
check('water tank: 1,000 L is 83 days of the family\'s water', has('water_tank', /1,000 L/) && has('water_tank', /83/));
check('fence: says it blocks zombies and is flagged as waiting', has('fence_wood', /zombies/i) && /zombies arrive/i.test(sample.fence_wood.tag), sample.fence_wood.tag);
check('canned food: 24 meals, 2 days for the family', has('canned_food', /24/) && has('canned_food', /2 days/), JSON.stringify(sample.canned_food.stats));
check('gasoline: marked as used in the game', /works/i.test(sample.gasoline.tag), sample.gasoline.tag);
check('pistol: honestly marked as not used yet', /not used yet/i.test(sample.pistol.tag) && has('pistol', /zombies/i), sample.pistol.tag);
check('tree: marked as decoration', /decoration/i.test(sample.tree_pine.tag), sample.tree_pine.tag);

await G(() => window.__game.showProduct('garden_bed'));
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'sheet-garden.png' });
await G(() => window.__game.showProduct('solar_panel'));
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'sheet-solar.png' });
await G(() => window.__game.showProduct('canned_food'));
await page.waitForTimeout(400);
await page.screenshot({ path: out + 'sheet-food.png' });

// ---- Every product has a complete sheet
const ids = await G(() => [...document.querySelectorAll('.item-row')].length);
const everyId = await G(async () => {
  const items = await import('/src/data/items.ts');
  const stores = await import('/src/data/stores.ts');
  return stores.STORES.online.stock.map(([id]) => id);
});
const bad = [];
for (const id of everyId) {
  await G((i) => window.__game.showProduct(i), id);
  const r = await page.evaluate(() => ({
    what: document.querySelector('.sheet-what')?.textContent ?? '',
    how: document.querySelectorAll('.sheet-list li').length,
    stats: document.querySelectorAll('.sheet-stat').length,
    tag: document.querySelector('.sheet-tag')?.textContent ?? '',
    name: document.querySelector('.sheet-name')?.textContent ?? '',
    undef: /undefined|NaN|\[object/.test(document.querySelector('.sheet')?.textContent ?? ''),
  }));
  if (!r.what || r.what.length < 8 || r.how < 1 || r.stats < 1 || !r.tag || r.undef) bad.push(`${id} (${JSON.stringify(r)})`);
}
check(`all ${everyId.length} products have a complete sheet`, bad.length === 0, bad.slice(0, 4).join(' | '));

console.log(errors.length ? '--- console errors ---\n' + errors.join('\n') : 'no console errors');
await browser.close();
