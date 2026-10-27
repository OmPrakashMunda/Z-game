import { chromium } from 'playwright-core';
import { newGame } from './helpers.mjs';

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
const G = (fn, arg) => page.evaluate(fn, arg);
// Warehouse yard: grid origin (10, 50), 15 columns by 13 rows
// No separate building mode any more: open the storage list and press Place on a row
const openStorage = async () => { if (!(await page.locator('.drawer').isVisible())) { await page.keyboard.press('KeyI'); await page.waitForTimeout(400); } };
const placeFrom = async (name) => { await openStorage(); await page.locator('.drawer .line', { hasText: name }).locator('.mini-btn', { hasText: 'Place' }).first().click(); await page.waitForTimeout(400); };const cellPx = async (cx, cz) => {
  await G(() => window.__game.settleCamera());
  return G(([x, z]) => window.__game.project(x, z, 0), [10 + cx * 2 + 1, 50 + cz * 2 + 1]);
};

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await newGame(page);
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.survivalOff(true));
await G(() => { window.__game.setRain(0); window.__game.ownPlot('warehouse'); window.__game.state.at = 'base'; window.__game.skipToDay(1, 13); });

// Every finished model must stand on the ground, not under it
const bounds = await G(() => window.__game.modelBounds());
const sunk = Object.entries(bounds).filter(([, b]) => b.minY < -0.02);
const flat = Object.entries(bounds).filter(([id, b]) => b.maxY < 0.05 && !/^path_|^pond_|^trench$/.test(id));
check('no finished model sits below the ground', sunk.length === 0, `(${Object.keys(bounds).length} models checked; below ground: ${sunk.map(([id, b]) => id + ' ' + b.minY.toFixed(2)).join(', ') || 'none'})`);
check('no model is accidentally flat', flat.length === 0, flat.map(([id]) => id).join(', '));

// Build the same scene as the screenshot: containers around the plot and a house in the middle
await G(() => { window.__game.give('container_20', 6); window.__game.give('house_family', 1); window.__game.give('fence_chain', 4); });
await placeFrom('Shipping container');
await page.waitForSelector('.placing-bar', { state: 'visible', timeout: 60000 });
await G(() => window.__game.settleCamera());
await page.waitForTimeout(500);

for (const [cx, cz] of [[3, 1], [6, 1], [9, 1]]) {
  const p = await cellPx(cx, cz);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}
await placeFrom('Family house');
const hp = await cellPx(7, 7);
await page.mouse.move(hp.x, hp.y);
await page.mouse.click(hp.x, hp.y);
await page.waitForTimeout(500);

// Nothing built yet: everything is a full-size blueprint, never squashed
let st = await G(() => window.__game.scenery().pieces);
check('placed pieces are all under construction', st.total === 4 && st.underConstruction === 4, JSON.stringify(st));
check('unfinished pieces are never squashed into the ground', st.minScaleY === 1, `(smallest vertical scale ${st.minScaleY})`);
await G(() => window.__game.settleCamera());
await page.waitForTimeout(800);
await page.screenshot({ path: out + 's1-blueprint.png' });

// Half way: the lower part is solid and the top is still a blueprint
await G(() => window.__game.advanceHours(0.5)); // containers 50%
await page.waitForTimeout(800);
st = await G(() => window.__game.scenery().pieces);
check('pieces being worked on still full size', st.minScaleY === 1 && st.underConstruction === 4, JSON.stringify(st));
await page.screenshot({ path: out + 's2-half-built.png' });
await G(() => window.__game.advanceHours(1)); // containers done; the house is a few percent in
await page.waitForTimeout(800);
st = await G(() => window.__game.scenery().pieces);
check('finished containers switch to the real model', st.underConstruction === 1, JSON.stringify(st));
await G(() => window.__game.advanceHours(6)); // the house is about half done
await page.waitForTimeout(800);
await page.screenshot({ path: out + 's3-house-half.png' });
await G(() => window.__game.advanceHours(10));
await page.waitForTimeout(800);
st = await G(() => window.__game.scenery().pieces);
check('everything is finished and solid', st.underConstruction === 0 && st.minScaleY === 1, JSON.stringify(st));
await page.screenshot({ path: out + 's4-finished.png' });

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
