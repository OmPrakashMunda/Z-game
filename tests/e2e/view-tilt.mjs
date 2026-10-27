import { chromium } from 'playwright-core';
import { newGame } from './helpers.mjs';
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
const tilt = () => G(() => window.__game.tiltDegrees());
const az = () => G(() => window.__game.viewDegrees());
const settle = async () => { await G(() => window.__game.settleCamera()); await page.waitForTimeout(300); };

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await newGame(page);
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.survivalOff(true); g.ownPlot('farm'); g.state.at = 'base';
  g.placeDone('cabin_small', 8, 6); g.placeDone('watchtower', 2, 2); g.placeDone('well_hand', 12, 3);
  for (let i = 0; i < 8; i++) g.placeDone('fence_wood', 4 + i, 0, 0);
  g.snapCamera(-55, 64);
});
await page.waitForTimeout(600);

check('the default tilt is the old 52 degrees', near(await tilt(), 52, 0.5), `(${(await tilt()).toFixed(1)})`);
check('the top bar has six view buttons', (await page.locator('.view-group .view-btn').count()) === 6);

// Buttons
await page.locator('.view-group .view-btn').nth(3).click(); // more from above
await settle();
const up1 = await tilt();
check('the look-from-above button raises the tilt', up1 > 60, `(${up1.toFixed(1)})`);
for (let i = 0; i < 6; i++) await page.locator('.view-group .view-btn').nth(3).click();
await settle();
check('the tilt stops just short of straight down', near(await tilt(), 88, 0.5), `(${(await tilt()).toFixed(1)})`);
for (let i = 0; i < 10; i++) await page.locator('.view-group .view-btn').nth(4).click();
await settle();
check('the tilt stops at 30 degrees looking from the side', near(await tilt(), 30, 0.5), `(${(await tilt()).toFixed(1)})`);
await page.locator('.view-group .view-btn.compass').click();
await settle();
check('the compass resets both turn and tilt', near(await tilt(), 52, 0.5) && near(await az(), 45, 0.5), `(tilt ${(await tilt()).toFixed(1)}, turn ${(await az()).toFixed(1)})`);

// Keys
await page.keyboard.down('KeyC');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyC');
const afterC = await tilt();
check('holding C tilts toward top-down', afterC > 54, `(${afterC.toFixed(1)})`);
await page.keyboard.down('KeyZ');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyZ');
const afterZ = await tilt();
check('holding Z tilts toward the horizon', afterZ < afterC - 2, `(${afterZ.toFixed(1)})`);
await G(() => { const g = window.__game; g.tiltView(52 - g.tiltDegrees()); });

// Right-drag up and down tilts, left and right turns
const t0 = await tilt();
await page.mouse.move(640, 300);
await page.mouse.down({ button: 'right' });
await page.mouse.move(640, 420, { steps: 6 });
await page.mouse.up({ button: 'right' });
const t1 = await tilt();
check('dragging down with the right button tilts toward top-down', t1 > t0 + 10, `(${t0.toFixed(1)} -> ${t1.toFixed(1)})`);
await G(() => { const g = window.__game; g.tiltView(52 - g.tiltDegrees()); g.turnView(45 - g.viewDegrees()); });

// Button turns land on clean angles
await G(() => { const g = window.__game; g.turnView(20); g.settleCamera(); });
await page.locator('.view-group .view-btn').nth(0).click();
await settle();
check('a turn button from 65 degrees lands on 90', near(await az(), 90, 0.5), `(${(await az()).toFixed(1)})`);
await G(() => { const g = window.__game; g.turnView(45 - g.viewDegrees()); g.settleCamera(); });

// Shapes: a 20 m square on the ground, seen from different angles
const corners = [[-65, 54], [-45, 54], [-45, 74], [-65, 74]];
const shape = async () => {
  const p = [];
  for (const [x, z] of corners) p.push(await G(([x, z]) => window.__game.project(x, z, 0), [x, z]));
  const a = { x: p[1].x - p[0].x, y: p[1].y - p[0].y };
  const b = { x: p[3].x - p[0].x, y: p[3].y - p[0].y };
  const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
  const angle = (Math.acos((a.x * b.x + a.y * b.y) / (la * lb)) * 180) / Math.PI;
  return { la, lb, angle, ratio: la / lb };
};
const set = async (azimuth, tiltDeg) => {
  await G(([a, t]) => { const g = window.__game; g.turnView(a - g.viewDegrees()); g.tiltView(t - g.tiltDegrees()); g.snapCamera(-55, 64); g.settleCamera(); }, [azimuth, tiltDeg]);
  await page.waitForTimeout(400);
  return shape();
};
let s = await set(20, 88);
check('straight down at 20 degrees: a square is still a square', Math.abs(s.angle - 90) < 1.5 && Math.abs(s.ratio - 1) < 0.03, `(sides ${s.la.toFixed(0)} x ${s.lb.toFixed(0)} px, corner ${s.angle.toFixed(1)} degrees)`);
s = await set(140, 88);
check('straight down at 140 degrees: still a square', Math.abs(s.angle - 90) < 1.5 && Math.abs(s.ratio - 1) < 0.03, `(sides ${s.la.toFixed(0)} x ${s.lb.toFixed(0)} px, corner ${s.angle.toFixed(1)} degrees)`);
s = await set(45, 52);
console.log(`default view: sides ${s.la.toFixed(0)} x ${s.lb.toFixed(0)} px, corner ${s.angle.toFixed(1)} degrees`);
check('at the default view the square is a diamond (equal sides)', Math.abs(s.ratio - 1) < 0.03 && Math.abs(s.angle - 90) > 10);
s = await set(20, 52);
console.log(`20 degrees, tilt 52: sides ${s.la.toFixed(0)} x ${s.lb.toFixed(0)} px, corner ${s.angle.toFixed(1)} degrees`);
check('at 20 degrees with a low tilt the square is a parallelogram (expected from the angle)', Math.abs(s.angle - 90) > 5);
s = await set(0, 52);
console.log(`0 degrees, tilt 52: sides ${s.la.toFixed(0)} x ${s.lb.toFixed(0)} px, corner ${s.angle.toFixed(1)} degrees`);
check('looking along an axis the square is a rectangle (right angles)', Math.abs(s.angle - 90) < 1.5);

// Walking keys follow the view: W goes away from the camera, D goes to the right of the screen
const walkDir = async (key, ms = 2500) => {
  const q0 = await G(() => window.__game.player());
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(300);
  const q1 = await G(() => window.__game.player());
  const dx = q1.x - q0.x;
  const dz = q1.z - q0.z;
  const len = Math.hypot(dx, dz);
  return { len, dx: dx / (len || 1), dz: dz / (len || 1) };
};
// Walking works at steep and shallow tilt
// Start the walking checks on open ground: the player begins in the middle of the base, which the tower and cabin fill
await G(async () => {
  const c = await import('/src/world/collide.ts');
  const col = await import('/src/sim/colliders.ts');
  const g = window.__game;
  c.setBaseSolids(col.baseColliders(g.state));
  const p = g.player();
  for (let r = 0; r <= 80; r += 4) {
    for (let a = 0; a < 360; a += 30) {
      const x = p.x + Math.cos((a * Math.PI) / 180) * r;
      const z = p.z + Math.sin((a * Math.PI) / 180) * r;
      let free = true;
      for (let rr = 0; rr <= 12 && free; rr += 2) for (let b = 0; b < 360; b += 45) if (c.blockedAt(x + Math.cos((b * Math.PI) / 180) * rr, z + Math.sin((b * Math.PI) / 180) * rr, 0.6)) { free = false; break; }
      if (free) { g.teleport(x, z); return; }
    }
  }
});
for (const [a, t] of [[45, 88], [135, 35]]) {
  await G(([a, t]) => { const g = window.__game; g.turnView(a - g.viewDegrees()); g.tiltView(t - g.tiltDegrees()); g.snapCamera(-30, 30); g.settleCamera(); }, [a, t]);
  await page.waitForTimeout(400);
  const ax = await G(() => window.__game.viewAxes());
  const w = await walkDir('KeyW');
  check(`W walks up the screen at turn ${a}, tilt ${t}`, w.len > 1 && w.dx * ax.up.x + w.dz * ax.up.z > 0.93, `(${w.len.toFixed(1)} m)`);}

// Pictures: top-down, and low from the side
await G(() => { const g = window.__game; g.turnView(20 - g.viewDegrees()); g.tiltView(88 - g.tiltDegrees()); g.snapCamera(-55, 64); g.settleCamera(); });
await page.keyboard.press('KeyV');
await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'tilt-top.png' });
await G(() => { const g = window.__game; g.turnView(150 - g.viewDegrees()); g.tiltView(32 - g.tiltDegrees()); g.settleCamera(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'tilt-low.png' });

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
