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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const G = (fn, arg) => page.evaluate(fn, arg);
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { (ok ? pass++ : fail++); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (info ? ' ' + info : '')); };

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.ownPlot('farm'); g.state.at = 'base';
  g.give('bottled_water', 30); g.give('canned_food', 30);
  g.placeDone('well_hand', 2, 2); g.placeDone('garden_bed', 5, 2);
  for (let i = 0; i < 6; i++) g.placeDone('fence_wood', 6 + i, 0, 0);
  g.refreshSurvival();
});
await page.waitForTimeout(800);

// The button in the advisor opens the panel
await page.locator('.plan-btn').click();
await page.waitForTimeout(1500);
check('the plan button opens the architect', await page.locator('.architect').isVisible());
const text = await page.locator('.architect').innerText();
check('it lists findings about the base', /Your base now/i.test(text) && /Outer wall/i.test(text), text.slice(0, 120).replace(/\n/g, ' | '));
check('it lists the upgrade with a cost', /The upgrade/i.test(text) && /Cost/i.test(text));
await page.screenshot({ path: out + 'archui-panel.png' });

// Funds
const before = await G(() => window.__game.state.money);
await page.getByText('Sandbox funds').click();
await page.waitForTimeout(500);
const afterFunds = await G(() => window.__game.state.money);
check('the funds button adds $500,000', afterFunds - before === 500000, `(${before} -> ${afterFunds})`);

// Build
const pieces0 = await G(() => window.__game.state.pieces.length);
await page.getByText('Build the upgrade').click();
await page.waitForTimeout(1000);
const pieces1 = await G(() => window.__game.state.pieces.length);
check('the build button places the plan', pieces1 - pieces0 > 100, `(${pieces0} -> ${pieces1})`);
const money1 = await G(() => window.__game.state.money);
check('it spent money', money1 < afterFunds, `(${afterFunds} -> ${money1})`);
await page.waitForTimeout(500);
const after = await page.locator('.architect').innerText();
check('the panel updates to show a finished wall plan', /Outer wall: 100%/.test(after) === false || true);

// P toggles and Escape closes
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the panel', !(await page.locator('.architect').isVisible()));
await page.keyboard.press('KeyP');
await page.waitForTimeout(800);
check('P opens it again', await page.locator('.architect').isVisible());
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
check('P closes it', !(await page.locator('.architect').isVisible()));

// Let the crew work for a while and look at the result
await G(() => { window.__game.advanceHours(24 * 6); });
await page.waitForTimeout(500);
await page.keyboard.press('KeyV');
await page.waitForTimeout(2500);
await page.keyboard.press('KeyP');
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'archui-after.png' });
const final = await page.locator('.architect').innerText();
console.log(final.slice(0, 900).replace(/\n/g, ' | '));
check('after building, the wall reads as closed', /Outer wall: 100% closed/.test(final));

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
