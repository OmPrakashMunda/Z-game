import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
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
const mod360 = (d) => ((d % 360) + 360) % 360;
const near = (a, b, tol) => Math.abs(mod360(a - b + 180) - 180) <= tol;
const deg = () => G(() => window.__game.viewDegrees());

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.survivalOff(true); g.ownPlot('farm'); g.state.at = 'base';
  g.placeDone('cabin_small', 8, 6); g.placeDone('watchtower', 2, 2); g.placeDone('well_hand', 12, 3);
  for (let i = 0; i < 8; i++) g.placeDone('fence_wood', 4 + i, 0, 0);
  g.snapCamera(-55, 64);
});
await page.waitForTimeout(600);

check('the default view is the old corner view (45 degrees)', near(await deg(), 45, 0.5), `(${(await deg()).toFixed(1)})`);

// Buttons in the top bar
check('the top bar has turn, compass, tilt and cable buttons', (await page.locator('.view-group .view-btn').count()) === 6);
const needle0 = await page.locator('.compass-icon').evaluate((e) => e.style.transform);
await page.locator('.view-group .view-btn').nth(2).click(); // turn right = clockwise = angle goes down
await G(() => window.__game.settleCamera());
await page.waitForTimeout(300);
check('turn right moves the view a quarter turn (45 -> 0)', near(await deg(), 0, 1), `(${(await deg()).toFixed(1)})`);
await page.locator('.view-group .view-btn').nth(0).click();
await page.locator('.view-group .view-btn').nth(0).click();
await G(() => window.__game.settleCamera());
await page.waitForTimeout(300);
check('turn left twice goes to 90', near(await deg(), 90, 1), `(${(await deg()).toFixed(1)})`);
const needle1 = await page.locator('.compass-icon').evaluate((e) => e.style.transform);
check('the compass needle turns with the view', needle0 !== needle1, `(${needle0} -> ${needle1})`);
await page.locator('.view-group .view-btn.compass').click();
await G(() => window.__game.settleCamera());
await page.waitForTimeout(300);
check('clicking the compass resets the view', near(await deg(), 45, 1), `(${(await deg()).toFixed(1)})`);

// Keyboard
await page.keyboard.down('KeyQ');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyQ');
const afterQ = await deg();
check('holding Q turns the view left', mod360(afterQ - 45) > 5 && mod360(afterQ - 45) < 180, `(${afterQ.toFixed(1)})`);
await page.keyboard.down('KeyE');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyE');
const afterE = await deg();
check('holding E turns it back', mod360(afterQ - afterE) > 5 && mod360(afterQ - afterE) < 180, `(${afterE.toFixed(1)})`);
await G(() => window.__game.turnView(45 - window.__game.viewDegrees()));

// Right-button drag
const before = await deg();
await page.mouse.move(640, 360);
await page.mouse.down({ button: 'right' });
await page.mouse.move(740, 360, { steps: 6 });
await page.mouse.up({ button: 'right' });
const dragged = await deg();
check('dragging with the right button turns the view', Math.abs(mod360(dragged - before + 180) - 180) > 20, `(${before.toFixed(1)} -> ${dragged.toFixed(1)})`);
await G(() => window.__game.turnView(45 - window.__game.viewDegrees()));

// Panning follows the screen at every angle: W moves the camera up the screen
for (const a of [45, 135, 225, 315]) {
  await G((a) => {
    const g = window.__game;
    g.turnView(a - g.viewDegrees());
    g.snapCamera(-30, 30);
    g.settleCamera();
  }, a);
  await page.waitForTimeout(400);
  const p0 = await G(() => window.__game.project(-30, 30, 0));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  const p1 = await G(() => window.__game.project(-30, 30, 0));
  check(`W moves the map up the screen at ${a} degrees`, p1.y > p0.y + 8 && Math.abs(p1.x - p0.x) < Math.max(6, 0.15 * (p1.y - p0.y)), `(${Math.round(p0.x)},${Math.round(p0.y)} -> ${Math.round(p1.x)},${Math.round(p1.y)})`);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(300);
  const p2 = await G(() => window.__game.project(-30, 30, 0));
  check(`D moves the map right at ${a} degrees`, p2.x < p1.x - 8, `(${Math.round(p1.x)} -> ${Math.round(p2.x)})`);
}

// Land-buying names follow the view
await G(() => { const g = window.__game; g.turnView(45 - g.viewDegrees()); g.snapCamera(-55, 64); });
await G(() => window.__game.snapCamera(-55, 64));
await page.waitForTimeout(500);
const plotAt = await G(() => window.__game.project(-60, 70, 0));
await page.mouse.click(plotAt.x, plotAt.y);
await page.waitForTimeout(800);
await page.locator('.place-panel .btn', { hasText: 'Buy more land' }).first().click();
await page.waitForTimeout(500);
const names45 = await page.locator('.expand-label').allInnerTexts();
await G(() => window.__game.turnView(90));
await page.waitForTimeout(500);
const names135 = await page.locator('.expand-label').allInnerTexts();
console.log('land names at 45:', JSON.stringify(names45), 'at 135:', JSON.stringify(names135));
check('the land edge names change when the view turns', JSON.stringify(names45) !== JSON.stringify(names135));
check('at 45 degrees the names are the original ones', /upper right/i.test(names45.join('|')) && /lower left/i.test(names45.join('|')));
await G(() => document.querySelector('.expand-panel .x').click());

// Four screenshots round the base, and they must all differ
const hashes = [];
for (const a of [45, 135, 225, 315]) {
  await G((a) => { const g = window.__game; g.turnView(a - g.viewDegrees()); g.settleCamera(); }, a);
  await page.waitForTimeout(900);
  const buf = await page.screenshot({ path: out + `rot-${a}.png` });
  hashes.push(createHash('md5').update(buf).digest('hex'));
}
check('the four views are all different pictures', new Set(hashes).size === 4);

// A full turn comes back to exactly the same view
await G(() => { const g = window.__game; g.turnView(45 - g.viewDegrees()); g.settleCamera(); });
await page.waitForTimeout(500);
const pa = await G(() => window.__game.project(-55, 64, 0));
await G(() => { const g = window.__game; g.turnView(360); g.settleCamera(); });
await page.waitForTimeout(500);
const pb = await G(() => window.__game.project(-55, 64, 0));
check('a full 360 turn returns to the same view', Math.hypot(pa.x - pb.x, pa.y - pb.y) < 1 && near(await deg(), 45, 0.5), `(${Math.round(pa.x)},${Math.round(pa.y)} vs ${Math.round(pb.x)},${Math.round(pb.y)}, angle ${(await deg()).toFixed(1)})`);
console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
