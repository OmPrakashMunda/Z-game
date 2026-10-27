import { chromium } from 'playwright-core';
import { newGame } from './helpers.mjs';

// Gamepad input. Headless Chrome has no controller, so a fake one is put in place of navigator.getGamepads(). The test moves its
// sticks and presses its buttons exactly as a real one reports them (the "standard" layout).
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GL_INVALID')) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const G = (fn, arg) => page.evaluate(fn, arg);
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);

await page.addInitScript(() => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = { id: 'Fake Pad (standard)', index: 0, connected: false, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons, vibrationActuator: null };
  window.__pad = pad;
  navigator.getGamepads = () => [pad.connected ? pad : null, null, null, null];
});
const pad = {
  plug: () => G(() => { window.__pad.connected = true; }),
  axes: (a) => G((a) => { window.__pad.axes = a; }, a),
  hold: (i, value = 1) => G(([i, value]) => { window.__pad.buttons[i] = { pressed: value > 0.5, touched: value > 0, value }; }, [i, value]),
  release: (i) => G((i) => { window.__pad.buttons[i] = { pressed: false, touched: false, value: 0 }; }, i),
  // Headless Chrome draws only a few frames a second, so a tap has to outlast a frame or the game never sees it
  tap: async (i, ms = 700) => { await pad.hold(i); await page.waitForTimeout(ms); await pad.release(i); await page.waitForTimeout(700); },
};
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, START = 9, L3 = 10, UP = 12, DOWN = 13;
const P = () => G(() => window.__game.player());
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForSelector('.title-screen', { timeout: 30000 });
await page.waitForTimeout(800);

// ---- Plugging in
await pad.plug();
await page.waitForTimeout(600);
check('plugging in a controller says so', /gamepad connected/i.test(await page.locator('.toast').innerText().catch(() => '')));

// ---- The title screen, with the controller only (after the username, which needs a keyboard)
await page.locator('.name-input').fill('Padder');
await page.keyboard.press('Enter');
await page.waitForSelector('.title-screen.main');
await pad.tap(DOWN);
check('the D-pad highlights a menu button', /single player/i.test(await page.locator('.menu-btn.pad-focus').innerText().catch(() => '')));
await pad.tap(DOWN);
check('down again moves to the next button (Multiplayer is off, so Profile)', /profile/i.test(await page.locator('.pad-focus').first().innerText().catch(() => '')), (await page.locator('.pad-focus').first().innerText().catch(() => 'none')).replace(/\s+/g, ' '));
await pad.tap(UP);
await pad.tap(A);
await page.waitForSelector('.title-screen.slots', { timeout: 5000 }).catch(() => {});
check('A presses the highlighted button', (await page.locator('.title-screen.slots').count()) === 1);
await pad.tap(B);
await page.waitForSelector('.title-screen.main', { timeout: 5000 }).catch(() => {});
check('B goes back', (await page.locator('.title-screen.main').count()) === 1);
await page.screenshot({ path: out + 'pad-title.png' });
// The left stick moves the highlight too
await pad.axes([0, 0.9, 0, 0]);
await page.waitForTimeout(300);
await pad.axes([0, 0, 0, 0]);
await page.waitForTimeout(200);
check('the left stick moves the highlight in a menu', (await page.locator('.pad-focus').count()) === 1);

// ---- Into a game (the keyboard starts it; everything after is the controller)
await page.locator('.menu-btn', { hasText: 'Single player' }).click();
await page.waitForSelector('.title-screen.slots');
await page.locator('.slot[data-slot="1"]').getByRole('button', { name: 'New game' }).click();
await page.waitForSelector('.title-screen.character');
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(2500);
await G(() => { const g = window.__game; g.survivalOff(true); g.setRain(0); g.teleport(0, 40); g.turnView(45 - g.viewDegrees()); g.settleCamera(); });
await page.waitForTimeout(500);

// ---- What the controller asks for, read straight from the input layer
await pad.axes([1, 0, 0, 0]);
await page.waitForTimeout(500);
let want = await G(() => window.__game.inputState());
check('the left stick fills the move axes', want.move.x > 0.99 && want.move.y === 0, JSON.stringify(want.move));
await pad.axes([0.5, 0, 0, 0]);
await page.waitForTimeout(500);
want = await G(() => window.__game.inputState());
check('half a stick is a gentler push, after the dead zone', want.move.x > 0.2 && want.move.x < 0.5, String(want.move.x.toFixed(2)));
await pad.axes([0, 0, 0, 0]);
await pad.hold(RT, 0.6);
await page.waitForTimeout(500);
want = await G(() => window.__game.inputState());
check('a half-pressed trigger is half gas', Math.abs(want.trigger - 0.6) < 0.01, String(want.trigger));
await pad.release(RT);

// ---- Walking
let p0 = await P();
await pad.axes([0.1, -0.1, 0, 0]);
await page.waitForTimeout(1500);
let p1 = await P();
check('a nudge inside the dead zone does not move you', dist(p0, p1) < 0.2, `(${dist(p0, p1).toFixed(2)} m)`);
const ax = await G(() => window.__game.viewAxes());
p0 = await P();
await pad.axes([1, 0, 0, 0]);
await page.waitForTimeout(3500);
await pad.axes([0, 0, 0, 0]);
p1 = await P();
const dRight = dist(p0, p1);
const towardRight = ((p1.x - p0.x) * ax.right.x + (p1.z - p0.z) * ax.right.z) / (dRight || 1);
check('the left stick right walks to the right of the screen', dRight > 1 && towardRight > 0.93, `(${dRight.toFixed(1)} m, ${towardRight.toFixed(2)})`);
p0 = await P();
await pad.axes([0, -1, 0, 0]);
await page.waitForTimeout(3500);
await pad.axes([0, 0, 0, 0]);
p1 = await P();
const towardUp = ((p1.x - p0.x) * ax.up.x + (p1.z - p0.z) * ax.up.z) / (dist(p0, p1) || 1);
check('the left stick up walks up the screen', dist(p0, p1) > 1 && towardUp > 0.93, `(${dist(p0, p1).toFixed(1)} m, ${towardUp.toFixed(2)})`);
await G(() => window.__game.teleport(0, 40));
await page.waitForTimeout(300);
p0 = await P();
await pad.axes([0, 0.45, 0, 0]);
await page.waitForTimeout(3000);
await pad.axes([0, 0, 0, 0]);
const slowD = dist(p0, await P());
await G(() => window.__game.teleport(0, 40));
await page.waitForTimeout(300);
p0 = await P();
await pad.axes([0, 0.45, 0, 0]);
await pad.hold(L3);
await page.waitForTimeout(3000);
await pad.axes([0, 0, 0, 0]);
await pad.release(L3);
const runD = dist(p0, await P());
await pad.hold(L3);
await page.waitForTimeout(800);
const runKeys = await G(() => window.__game.inputState());
await pad.release(L3);
check('pressing the left stick runs', runKeys.sprint === true && runD > slowD * 1.05, `(${runD.toFixed(1)} m run, ${slowD.toFixed(1)} m walk)`);

// ---- The view
const v0 = await G(() => window.__game.viewDegrees());
await pad.hold(RB);
await page.waitForTimeout(1500);
await pad.release(RB);
const v1 = await G(() => window.__game.viewDegrees());
check('the right shoulder button turns the view clockwise', v1 < v0 - 3, `(${v0.toFixed(0)} to ${v1.toFixed(0)} degrees)`);
await pad.hold(LB);
await page.waitForTimeout(1500);
await pad.release(LB);
const v2 = await G(() => window.__game.viewDegrees());
check('the left one turns it the other way', v2 > v1 + 3, `(${v1.toFixed(0)} to ${v2.toFixed(0)})`);
await pad.axes([0, 0, 1, 0]);
await page.waitForTimeout(1500);
await pad.axes([0, 0, 0, 0]);
const v3 = await G(() => window.__game.viewDegrees());
check('the right stick right turns it clockwise too', v3 < v2 - 3, `(${v2.toFixed(0)} to ${v3.toFixed(0)})`);
const t0 = await G(() => window.__game.tiltDegrees());
await pad.axes([0, 0, 0, -1]);
await page.waitForTimeout(1500);
await pad.axes([0, 0, 0, 0]);
const t1 = await G(() => window.__game.tiltDegrees());
check('the right stick up tilts toward straight down', t1 > t0 + 2, `(${t0.toFixed(0)} to ${t1.toFixed(0)})`);
await pad.tap(L3 + 1); // R3: reset the view
await page.waitForTimeout(2500);
check('pressing the right stick resets the view', Math.abs((await G(() => window.__game.viewDegrees())) - 45) < 1.5);
const span = async () => G(() => { const a = window.__game.project(0, 40, 0); const b = window.__game.project(20, 40, 0); return Math.hypot(a.x - b.x, a.y - b.y); });
const s0 = await span();
await pad.hold(UP);
await page.waitForTimeout(1500);
await pad.release(UP);
const s1 = await span();
check('D-pad up zooms in', s1 > s0 * 1.1, `(${s0.toFixed(0)} px to ${s1.toFixed(0)} px for 20 m)`);

// ---- A vehicle
const car = await G(() => {
  const g = window.__game;
  const p = g.player();
  const v = g.giveVehicle('sedan', 45);
  g.setVehicle(v.id, { x: p.x + 12, z: p.z, heading: Math.PI / 2, speed: 0 });
  g.teleport(p.x + 12, p.z + 2.8);
  g.snapCamera(p.x + 12, p.z);
  g.settleCamera();
  return v.id;
});
await page.waitForTimeout(500);
check('next to a vehicle the prompt offers to drive', /drive sedan/i.test((await P()).prompt ?? ''));
await pad.tap(A);
await page.waitForTimeout(500);
check('A gets in', (await G(() => window.__game.state.driving)) === car);
const speedNow = () => G(() => Math.abs(window.__game.vehicles().find((v) => v.id === window.__game.state.driving)?.speed ?? 0));
await pad.hold(RT);
await page.waitForTimeout(3000);
const fast = await speedNow();
check('the right trigger is the gas', fast > 3, `(${fast.toFixed(1)} m/s)`);
const h0 = await G(() => window.__game.vehicles().find((v) => v.id === window.__game.state.driving).heading);
await pad.axes([1, 0, 0, 0]);
await page.waitForTimeout(2000);
await pad.axes([0, 0, 0, 0]);
const h1 = await G(() => window.__game.vehicles().find((v) => v.id === window.__game.state.driving).heading);
check('the left stick steers', Math.abs(h1 - h0) > 0.15, `(heading ${h0.toFixed(2)} to ${h1.toFixed(2)})`);
await pad.release(RT);
await pad.hold(LT);
await page.waitForTimeout(3500);
const slow = await speedNow();
check('the left trigger brakes', slow < fast * 0.6, `(${fast.toFixed(1)} to ${slow.toFixed(1)} m/s)`);
await pad.release(LT);
const pc = await P();
const at = await G(() => window.__game.project(window.__game.player().x, window.__game.player().z, 0));
check('the view stays with the vehicle', Math.hypot(at.x - 640, at.y - 360) < 260, `(${Math.round(Math.hypot(at.x - 640, at.y - 360))} px off centre)`);
await G(() => window.__game.setVehicle(window.__game.state.driving, { speed: 0 }));
await pad.tap(A);
await page.waitForTimeout(500);
check('A gets out', (await G(() => window.__game.state.driving)) === null);

// ---- Menus in the game
await pad.tap(START);
await page.waitForTimeout(500);
check('Start opens the pause menu', (await page.locator('.overlay').count()) === 1 && /paused/i.test(await page.locator('.overlay h2').innerText()));
await pad.tap(DOWN);
check('the D-pad highlights a button in it', (await page.locator('.overlay .pad-focus').count()) === 1);
await pad.tap(B);
await page.waitForTimeout(500);
check('B resumes', (await page.locator('.overlay').count()) === 0 && (await G(() => window.__game.state !== null)));
await pad.tap(X);
await page.waitForTimeout(500);
check('X opens the storage list', await page.locator('.drawer').isVisible());
p0 = await P();
await pad.axes([1, 0, 0, 0]);
await page.waitForTimeout(1200);
await pad.axes([0, 0, 0, 0]);
check('the stick does not walk you around while a list is open', dist(p0, await P()) < 0.3, `(${dist(p0, await P()).toFixed(2)} m)`);
await pad.tap(B);
await page.waitForTimeout(500);
check('B closes the list', !(await page.locator('.drawer').isVisible()));
await pad.tap(Y);
await page.waitForTimeout(800);
check('Y opens the online store', await page.locator('.modal.shop').isVisible());
await pad.tap(DOWN);
await pad.tap(DOWN);
check('the D-pad moves around the store', (await page.locator('.modal-overlay .pad-focus').count()) === 1);
await page.screenshot({ path: out + 'pad-store.png' });
await pad.tap(B);
await page.waitForTimeout(500);
if (await page.locator('.modal.shop').isVisible()) await pad.tap(B);
await page.waitForTimeout(500);
check('B closes it', !(await page.locator('.modal.shop').isVisible()));
if ((await page.locator('.overlay').count()) > 0) await pad.tap(B);
await page.waitForTimeout(500);

// ---- The keyboard still works with a controller plugged in
p0 = await P();
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
check('the keyboard still works', dist(p0, await P()) > 0.8, `(${dist(p0, await P()).toFixed(1)} m)`);

// ---- Unplugging
await G(() => { window.__pad.connected = false; });
await page.waitForTimeout(400);
p0 = await P();
await pad.axes([1, 0, 0, 0]);
await page.waitForTimeout(1000);
check('an unplugged controller does nothing', dist(p0, await P()) < 0.2);

console.log('--- console errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
