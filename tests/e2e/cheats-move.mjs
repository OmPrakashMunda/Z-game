import { chromium } from 'playwright-core';
import { newGame, continueGame } from './helpers.mjs';

// The cheats for getting around: teleports, vehicles on demand, and the speed, no-clip and carrying switches.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('GL_INVALID')) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const G = (fn, arg) => page.evaluate(fn, arg);
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const P = () => G(() => JSON.parse(JSON.stringify(window.__game.player())));
const cheat = async (code) => {
  if (!(await page.locator('.cheat-console').isVisible())) { await page.keyboard.press('Backquote'); await page.waitForTimeout(300); }
  const box = page.locator('.cheat-console input');
  await box.fill(code);
  await box.press('Enter');
  await page.waitForTimeout(450);
  return page.locator('.cheat-result').innerText();
};
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await newGame(page);
await page.waitForTimeout(1200);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); });
await page.waitForTimeout(500);

// ---- Teleports
let r = await cheat('backtobase');
check('BACKTOBASE says you have no base yet', /no base/i.test(r), r);
await G(() => window.__game.ownPlot('warehouse'));
await cheat('goto hardware');
let p = await P();
check('GOTO hardware puts you at its door', p.at === 'hardware', JSON.stringify([p.x, p.z, p.at]));
r = await cheat('goto nowhere');
check('GOTO with a bad name lists the places', /Places:/.test(r) && /hardware/.test(r), r.slice(0, 80));
await cheat('goto realty');
p = await P();
check('GOTO realty', p.at === 'real_estate');
await cheat('backtobase');
p = await P();
check('BACKTOBASE takes you to your land', p.at === 'base' && near(p.x, 25) && near(p.z, 63, 4), JSON.stringify([p.x, p.z, p.at]));
await cheat('goto woods');
p = await P();
check('GOTO woods takes you to the clearing', near(p.x, 160, 6) && near(p.z, -38, 6), JSON.stringify([p.x, p.z]));
await cheat('coords 300 -280');
p = await P();
check('COORDS goes to a map position', near(p.x, 300, 6) && near(p.z, -280, 6), JSON.stringify([p.x, p.z]));
r = await cheat('coords 5000 0');
check('COORDS refuses the edge of the world', /between/.test(r), r);
r = await cheat('whereami');
check('WHEREAMI tells you where you are', /x 3\d\d, z -2\d\d/.test(r), r);
const w = await G(() => { window.__game.waypoint(-200, 150); return window.__game.player().waypoint; });
await cheat('gotowaypoint');
p = await P();
check('GOTOWAYPOINT goes to the waypoint', !!w && near(p.x, -200, 6) && near(p.z, 150, 6), JSON.stringify([p.x, p.z]));

// ---- Houses
await cheat('coords 250 120');
const before = await P();
r = await cheat('gotohouse');
p = await P();
check('GOTOHOUSE takes you to a house door', /door of a/.test(r) && Math.hypot(p.x - before.x, p.z - before.z) > 0.5, r);
await G(() => window.__game.skipToDay(30, 9));
await page.waitForTimeout(500);
await cheat('gotohouse');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
p = await P();
check('at that door the game offers a search', /^Search the /i.test(p.prompt ?? ''), JSON.stringify(p.prompt));
await cheat('quicksearch');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Space');
await G(() => window.__game.advanceHours(0.05));
await page.waitForTimeout(500);
let loot = await G(() => window.__game.loot());
check('QUICKSEARCH finishes a search at once', Object.keys(loot.looted).length === 1 && loot.searching === null);
r = await cheat('resethouses');
loot = await G(() => window.__game.loot());
check('RESETHOUSES makes searched houses full again', /full again/.test(r) && Object.keys(loot.looted).length === 0, r);
await cheat('quicksearch');

// ---- Vehicles on demand
r = await cheat('givecar sedan');
let cars = await G(() => window.__game.vehicles());
check('GIVECAR parks a sedan with a full tank', cars.length === 1 && cars[0].type === 'sedan' && cars[0].fuel === 50, r);
r = await cheat('givecar rocket');
check('GIVECAR with a bad name lists the vehicles', /Vehicles:/.test(r));
await cheat('givecar bike');
cars = await G(() => window.__game.vehicles());
check('GIVECAR accepts short names', cars.length === 2 && cars[1].type === 'bicycle');
await G(() => window.__game.setVehicle(1 + 0 * 1, {}));
await cheat('coords -300 -300');
await cheat('gotocar');
p = await P();
const car = await G(() => window.__game.vehicles().find((v) => v.type === 'sedan'));
check('GOTOCAR takes you beside your vehicle', Math.hypot(p.x - car.x, p.z - car.z) < 8, `(${Math.hypot(p.x - car.x, p.z - car.z).toFixed(1)} m)`);
await cheat('coords 100 100');
await cheat('callcar');
p = await P();
const called = await G(() => window.__game.vehicles());
check('CALLCAR brings a vehicle to you', called.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 10));
await G(() => { for (const v of window.__game.vehicles()) window.__game.setVehicle(v.id, { fuel: 1, hp: 30 }); });
r = await cheat('refuelall');
const filled = await G(() => window.__game.vehicles());
check('REFUELALL fills every tank', filled.find((v) => v.type === 'sedan').fuel === 50 && /2 vehicles/.test(r), r);
r = await cheat('repaircars');
const fixed = await G(() => window.__game.vehicles());
check('REPAIRCARS repairs every vehicle', fixed.find((v) => v.type === 'sedan').hp === 220, r);

// A driver goes along with a teleport
await page.keyboard.press('Escape');
await G(() => window.__game.enterVehicle());
await page.waitForTimeout(400);
const driving = await G(() => window.__game.state.driving);
await cheat('coords 0 300');
const moved = await G(() => { const g = window.__game; return { p: g.player(), v: g.vehicles().find((x) => x.id === g.state.driving) }; });
check('teleporting while driving takes the vehicle too', driving !== null && Math.hypot(moved.v.x - moved.p.x, moved.v.z - moved.p.z) < 0.5 && near(moved.p.z, 300, 8));
await G(() => { window.__game.setVehicle(window.__game.state.driving, { speed: 0 }); window.__game.exitVehicle(); });

// ---- Switches
await cheat('endlessfuel');
await cheat('coords 0 300');
r = await cheat('fastfeet');
check('FASTFEET turns on and shows in the cheat tag', /on/.test(r) && /FASTFEET/.test(await page.locator('.cheat-tag').getAttribute('title')));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const sp = await G(() => window.__game.player());
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
const sp2 = await P();
const fast = Math.hypot(sp2.x - sp.x, sp2.z - sp.z);
await cheat('fastfeet');
await page.keyboard.press('Escape');
await G(([x, z]) => window.__game.teleport(x, z), [sp.x, sp.z]);
await page.waitForTimeout(300);
await page.keyboard.down('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyD');
const sp3 = await P();
const slow = Math.hypot(sp3.x - sp.x, sp3.z - sp.z);
check('FASTFEET makes you walk much faster', fast > slow * 1.5, `(${fast.toFixed(1)} m against ${slow.toFixed(1)} m in the same time)`);

// No-clip: walk straight through a house
await cheat('goto hardware');
const hw = await G(async () => { const c = await import('/src/data/city.ts'); const l = c.locationById('hardware'); return { entry: l.entry, b: l.building }; });
await G(([x, z]) => window.__game.teleport(x, z), [hw.entry.x, hw.entry.z]);
let t = await G(() => window.__game.walk(0, -1, 4));
check('without NOCLIP the shop wall stops you', t.z > hw.b.z + hw.b.d / 2 - 0.5, `(z ${t.z.toFixed(1)})`);
r = await cheat('noclip');
await page.keyboard.press('Escape');
await G(([x, z]) => window.__game.teleport(x, z), [hw.entry.x, hw.entry.z]);
await page.waitForTimeout(200);
await page.keyboard.down('KeyW');
await page.waitForTimeout(16000);
await page.keyboard.up('KeyW');
const through = await P();
check('NOCLIP lets you walk through the shop', /NOCLIP on/.test(r) && through.z < t.z - 3, `(z ${through.z.toFixed(1)}, the wall stopped you at ${t.z.toFixed(1)})`);
await cheat('noclip');

// Big pack
await G(() => { const g = window.__game; g.give('lumber', 5); });
const pack0 = await G(async () => { const c = await import('/src/sim/cargo.ts'); return c.packRoom(window.__game.state); });
await cheat('bigpack');
const pack1 = await G(async () => { const c = await import('/src/sim/cargo.ts'); return c.packRoom(window.__game.state); });
check('BIGPACK removes the weight limit', pack0 <= 25 && pack1 > 1e6, `(${pack0} -> ${pack1})`);
await cheat('bigpack');

// Turbo
await cheat('coords 200 -150');
const tid = (await cheat('givecar sedan'), await G(() => window.__game.vehicles().pop().id));
await G(([id]) => window.__game.setVehicle(id, { x: 200, z: -150, heading: 0 }), [tid]);
await G(([id]) => { window.__game.teleport(203, -150); window.__game.enterVehicle(id); }, [tid]);
const normal = await G(() => window.__game.drive(1, 0, 8));
await G(([id]) => window.__game.setVehicle(id, { x: 200, z: -150, speed: 0 }), [tid]);
await cheat('turbo');
const fastCar = await G(() => window.__game.drive(1, 0, 8));
check('TURBO makes vehicles faster', fastCar.v.speed > normal.v.speed * 1.5, `(${(fastCar.v.speed * 3.6).toFixed(0)} against ${(normal.v.speed * 3.6).toFixed(0)} km/h)`);

// Emptying the pack anywhere
await G(() => { window.__game.setVehicle(window.__game.state.driving, { speed: 0 }); window.__game.exitVehicle(); });
await cheat('turbo');
await G(() => { window.__game.state.pack = { canned_food: 2 }; });
r = await cheat('emptypack');
const stored = await G(() => ({ pack: window.__game.state.pack, food: window.__game.state.storage.canned_food }));
check('EMPTYPACK moves the backpack into storage anywhere', Object.keys(stored.pack).length === 0 && stored.food >= 2, r);

// ---- Session only
await cheat('fastfeet');
await cheat('noclip');
await cheat('bigpack');
await cheat('turbo');
const tags = await page.locator('.cheat-tag').getAttribute('title');
check('every switch shows in the cheat tag', ['FASTFEET', 'NOCLIP', 'BIGPACK', 'TURBO'].every((n) => tags.includes(n)), tags);
r = await cheat('resetcheats');
const left = await page.locator('.cheat-tag').isVisible();
check('RESETCHEATS switches the new ones off', !left);
await cheat('noclip');
await G(() => window.__game.save());
await page.reload();
await page.waitForTimeout(2500);
await continueGame(page);
await page.waitForTimeout(1500);
check('the new switches are gone after a reload', !(await page.locator('.cheat-tag').isVisible()));
r = await cheat('help');
check('HELP lists the new codes', /BACKTOBASE/.test(r) && /NOCLIP/.test(r) && /GIVECAR/.test(r), r.slice(0, 60));

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
