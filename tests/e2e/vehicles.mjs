import { chromium } from 'playwright-core';

// Vehicles: buying, driving, fuel, crashes, repairs, fitted parts and saving.
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
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
const S = () => G(() => JSON.parse(JSON.stringify({ money: window.__game.state.money, storage: window.__game.state.storage, driving: window.__game.state.driving, at: window.__game.state.at })));
const VID = (id) => G((i) => window.__game.vehicles().find((v) => v.id === i), id);
const V = (type) => G((t) => window.__game.vehicles().find((v) => !t || v.type === t), type);
/** Park a vehicle at a spot, walk up to it and get in. */
const drive = async (type, x, z, heading = 0, fuel) => {
  const v = await G(([t, f]) => window.__game.giveVehicle(t, f), [type, fuel]);
  await G(([id, x, z, h]) => window.__game.setVehicle(id, { x, z, heading: h }), [v.id, x, z, heading]);
  await G(([x, z]) => window.__game.teleport(x + 2.5, z), [x, z]);
  await page.waitForTimeout(300);
  await G((id) => window.__game.enterVehicle(id), v.id);
  return v.id;
};
const leave = async () => {
  await G(() => {
    const g = window.__game;
    if (g.state.driving !== null) g.setVehicle(g.state.driving, { speed: 0 });
    g.exitVehicle();
  });
};

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(800);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); window.__game.skipToDay(1, 12); });
await page.waitForTimeout(800);

// ---- The range on offer
const catalog = await G(async () => {
  const d = await import('/src/data/vehicles.ts');
  const s = await import('/src/data/stores.ts');
  const info = await import('/src/data/info.ts');
  const dealer = s.STORES.vehicle_dealer.stock.map(([id]) => id);
  return {
    count: d.VEHICLE_LIST.length,
    allSold: d.VEHICLE_LIST.every((v) => dealer.includes(v.item)),
    partsSold: d.ATTACHMENT_LIST.every((a) => dealer.includes(a.item)),
    speeds: new Set(d.VEHICLE_LIST.map((v) => v.topSpeed)).size,
    durs: new Set(d.VEHICLE_LIST.map((v) => v.durability)).size,
    fuels: [...new Set(d.VEHICLE_LIST.map((v) => v.fuel))].sort(),
    sheet: info.productInfo('sedan').stats.map((x) => x.label),
    online: s.STORES.online.stock.some(([id]) => id === 'sedan'),
  };
});
check('seven vehicles are on sale at the dealership', catalog.count === 7 && catalog.allSold);
check('their speeds and durability all differ', catalog.speeds === 7 && catalog.durs === 7);
check('there are fuel-free, petrol and diesel vehicles', JSON.stringify(catalog.fuels) === JSON.stringify(['diesel', 'none', 'petrol']));
check('every attachment is on sale too', catalog.partsSold);
check('the online store sells vehicles as well', catalog.online);
check('the product sheet shows speed, range and cargo', ['Top speed', 'Range', 'Cargo', 'Durability', 'Towing'].every((l) => catalog.sheet.includes(l)), JSON.stringify(catalog.sheet));

// ---- Buying at the dealership
await G(() => window.__game.ownPlot('warehouse'));
await G(() => window.__game.teleportTo('vehicle_dealer'));
await page.waitForTimeout(600);
await page.keyboard.press('Space');
await page.waitForSelector('.modal.shop', { timeout: 20000 });
const m0 = (await S()).money;
await page.locator('.item-row', { hasText: 'Sedan' }).first().locator('.qbtn', { hasText: '+' }).first().click();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(600);
let s = await S();
check('buying a sedan costs its price', m0 - s.money === 11500, `(${m0 - s.money})`);
check('the sedan is a vehicle, not a storage item', !s.storage.sedan && (await G(() => window.__game.vehicles().length)) === 1);
const bought = await V('sedan');
const lot = await G(() => ({ x: -16, z: 15 }));
check('it is parked outside the dealership', Math.hypot(bought.x - lot.x, bought.z - lot.z) < 40 && bought.z > 21, `(${bought.x.toFixed(0)}, ${bought.z.toFixed(0)})`);
check('a waypoint marks the new vehicle', (await P()).waypoint !== null);
await page.screenshot({ path: out + 'veh-bought.png' });
await page.getByRole('button', { name: 'Close' }).click();

// ---- Online orders arrive beside the land
await page.keyboard.press('KeyB');
await page.waitForSelector('.modal.shop');
await page.locator('.cat-side .cat-tab', { hasText: 'Vehicles' }).click();
await page.locator('.item-row', { hasText: 'Bicycle' }).first().locator('.qbtn', { hasText: '+' }).first().click();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(500);
const bike = await V('bicycle');
check('an online vehicle is parked beside the land', !!bike && Math.hypot(bike.x - 25, bike.z - 63) < 40, `(${bike?.x?.toFixed(0)}, ${bike?.z?.toFixed(0)})`);
await page.getByRole('button', { name: 'Close' }).click();

// ---- Getting in and out
await G(([x, z]) => window.__game.teleport(x + 2.5, z), [bought.x, bought.z]);
await page.waitForTimeout(500);
const near = await P();
check('standing beside it offers to drive', /Drive Sedan/i.test(near.prompt ?? ''), JSON.stringify(near.prompt));
await page.keyboard.press('Space');
await page.waitForTimeout(500);
check('Space gets you in', (await S()).driving === bought.id);
check('the driving display appears', await page.locator('.dash').isVisible());
await page.keyboard.press('Space');
await page.waitForTimeout(500);
check('Space gets you out when stopped', (await S()).driving === null && !(await page.locator('.dash').isVisible()));

// ---- Driving on the road: speed, fuel and the surface
const sedanId = await drive('sedan', 200, 100, 0, 40);
let r = await G(() => window.__game.drive(1, 0, 14));
const sedanTop = 28;
check('a sedan reaches its top speed on a road', r.v.speed > sedanTop * 0.95 && r.v.speed <= sedanTop + 0.01, `(${(r.v.speed * 3.6).toFixed(0)} km/h)`);
check('driving uses fuel by distance', r.v.fuel < 40 && r.v.fuel > 40 - 1.5 * ((r.v.z - 100) / 1000) - 0.5, `(${r.v.fuel.toFixed(2)} L after ${(r.v.z - 100).toFixed(0)} m)`);
check('the player and camera follow the vehicle', Math.abs(r.player.z - r.v.z) < 0.01 && Math.abs(r.player.x - r.v.x) < 0.01);
await page.waitForTimeout(600);
const w = await G(() => window.__game.world());
check('the world streams in around a fast vehicle', w.keys.length > 12 && w.keys.some((k) => k.endsWith(',1') || k.endsWith(',2')), `(${w.keys.length} chunks)`);
await page.screenshot({ path: out + 'veh-driving.png' });
r = await G(() => window.__game.drive(0, 0, 8, true));
check('the brake stops the vehicle', Math.abs(r.v.speed) < 0.2, `(${r.v.speed.toFixed(2)})`);
await leave();

// Open ground slows every vehicle, some more than others. Find a stretch of open grass with nothing in the way.
const field = await G(async () => {
  const veh = await import('/src/sim/vehicles.ts');
  const col = await import('/src/world/collide.ts');
  for (let x = -280; x <= 280; x += 20) {
    for (let z = -280; z <= 280; z += 20) {
      let ok = true;
      for (let d = 0; d <= 90 && ok; d += 2) if (veh.surfaceAt(x + d, z) !== 'grass' || col.blockedAt(x + d, z, 1.6)) ok = false;
      if (ok) return { x, z };
    }
  }
  return null;
});
check('there is open ground to test on', !!field, JSON.stringify(field));
const speedsOnGrass = {};
if (field) {
  let row = 0;
  for (const type of ['sedan', 'suv', 'bicycle']) {
    const id = await drive(type, field.x, field.z, Math.PI / 2, 40);
    const g = await G(() => window.__game.drive(1, 0, 5));
    speedsOnGrass[type] = g.v.speed;
    await leave();
    await G((id) => window.__game.setVehicle(id, { x: -560, z: -560 }), id);
    row++;
  }
}
check('open ground is much slower than a road for a sedan', speedsOnGrass.sedan > 0 && speedsOnGrass.sedan < 28 * 0.5, `(${((speedsOnGrass.sedan ?? 0) * 3.6).toFixed(0)} km/h)`);
check('an SUV copes with open ground better than a sedan', speedsOnGrass.suv > speedsOnGrass.sedan * 1.5, `(${((speedsOnGrass.suv ?? 0) * 3.6).toFixed(0)} vs ${((speedsOnGrass.sedan ?? 0) * 3.6).toFixed(0)} km/h)`);
// Top speeds of the others
const tops = {};
for (const type of ['bicycle', 'scooter', 'pickup', 'van', 'truck']) {
  await drive(type, 200, -150, 0, 500);
  tops[type] = (await G(() => window.__game.drive(1, 0, 12))).v.speed;
  await leave();
}
check('vehicles have different top speeds', new Set(Object.values(tops).map((x) => Math.round(x))).size === 5 && tops.bicycle < tops.scooter && tops.truck < tops.pickup, JSON.stringify(Object.fromEntries(Object.entries(tops).map(([k, v]) => [k, Math.round(v * 3.6)]))));
const bikeV = await G(() => window.__game.vehicles().filter((v) => v.type === 'bicycle').pop());
check('a bicycle uses no fuel', bikeV.fuel === 0);

// ---- Running out of fuel
await drive('sedan', 200, -300, 0, 0.5);
r = await G(() => window.__game.drive(1, 0, 15));
check('the tank runs dry', r.ranDry && r.v.fuel === 0, `(${r.v.fuel})`);
const coast = await G(() => window.__game.drive(1, 0, 10));
check('with no fuel the vehicle only slows down', coast.v.speed < r.v.speed - 3, `(${r.v.speed.toFixed(1)} -> ${coast.v.speed.toFixed(1)} m/s)`);
await page.waitForTimeout(1200);
check('the display warns about the empty tank', /Out of fuel/i.test(await page.locator('.dash').innerText()));
await leave();

// ---- Crashes
const crashId = await drive('sedan', 2, -14, Math.PI / 2, 40);
const hp0 = (await VID(crashId)).hp;
await G((id) => { window.__crashId = id; }, crashId);
r = await G(() => window.__game.drive(1, 0, 6));
const firstCrash = r.damage;
check('hitting a building hurts and stops the vehicle', r.damage > 5 && r.v.hp < hp0 && r.v.x < 10, `(${r.damage.toFixed(0)} damage, x ${r.v.x.toFixed(1)})`);
await G(([id]) => window.__game.setVehicle(id, { speed: 0 }), [crashId]);
await leave();
// Bring it home to the base
await G(([id]) => window.__game.setVehicle(id, { x: 25, z: 63, heading: 0, speed: 0, hp: 220, fuel: 40 }), [crashId]);
await G(() => window.__game.teleport(27.5, 63));
await page.waitForTimeout(400);
check('standing on the land counts as the base', (await P()).at === 'base');
// ---- Fitting parts at the base (through the vehicle card)
await G(() => { const g = window.__game; g.give('bull_bar', 1); g.give('tow_hitch', 1); g.give('trailer', 1); g.give('roof_rack', 1); g.give('extra_tank', 1); g.give('spare_parts', 5); g.give('gasoline', 3); });
await G(() => window.__game.snapCamera(25, 63));
await G(() => window.__game.settleCamera());
await page.waitForTimeout(500);
const pk = await G(([x, z]) => window.__game.project(x, z, 1), [25, 63]);
await page.mouse.move(pk.x, pk.y);
await page.waitForTimeout(200);
await page.mouse.click(pk.x, pk.y);
await page.waitForTimeout(600);
check('clicking a vehicle opens its card', (await page.locator('.place-panel h2').textContent()) === 'Sedan');
check('the card shows fuel and condition', /fuel/i.test(await page.locator('.place-panel .stats').innerText()) && /condition/i.test(await page.locator('.place-panel .stats').innerText()));
await page.getByRole('button', { name: /Fit bull bar/i }).click();
await page.waitForTimeout(300);
let v = await VID(crashId);
check('a bull bar can be fitted', v.parts.includes('bull_bar') && (await S()).storage.bull_bar === 0);
check('a sedan cannot be fitted with a tow hitch', (await page.getByRole('button', { name: /Fit tow hitch/i }).count()) === 0);
await page.getByRole('button', { name: /Fit roof rack/i }).click();
await page.getByRole('button', { name: /Fit extra fuel tank/i }).click();
await page.waitForTimeout(300);
v = await VID(crashId);
const sizes = await G(async (id) => {
  const veh = await import('/src/sim/vehicles.ts');
  const st = window.__game.state;
  const x = st.vehicles.find((q) => q.id === id);
  return { tank: veh.tankSize(x), cargo: veh.cargoSize(x) };
}, v.id);
check('a roof rack and extra tank add cargo and range', sizes.tank === 80 && sizes.cargo === 170, JSON.stringify(sizes));
await page.screenshot({ path: out + 'veh-card.png' });
// crash with the bull bar
await G(() => { const g = window.__game; const x = g.state.vehicles.find((q) => q.id === window.__crashId); g.setVehicle(x.id, { x: 2, z: -14, heading: Math.PI / 2, speed: 0, hp: 220 }); g.teleport(4.5, -14); g.enterVehicle(); });
await page.waitForTimeout(300);
r = await G(() => window.__game.drive(1, 0, 6));
check('a bull bar halves the crash damage', r.damage > 2 && r.damage < firstCrash * 0.7, `(${r.damage.toFixed(1)} against ${firstCrash.toFixed(1)} without)`);
await G(() => window.__game.setVehicle(window.__game.state.driving, { speed: 0 }));
await leave();
// ---- Refuel from cans, repair with parts, at the base
await G(() => { const g = window.__game; const x = g.state.vehicles.find((q) => q.id === window.__crashId); g.setVehicle(x.id, { x: 25, z: 63, heading: 0, speed: 0, hp: 100, fuel: 10 }); g.teleport(27.5, 63); g.snapCamera(25, 63); g.settleCamera(); });
await page.waitForTimeout(300);
const pk2 = await G(([x, z]) => window.__game.project(x, z, 1), [25, 63]);
await page.mouse.move(pk2.x, pk2.y);
await page.waitForTimeout(200);
await page.mouse.click(pk2.x, pk2.y);
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Fill from fuel cans/ }).click();
await page.waitForTimeout(300);
v = await VID(crashId);
s = await S();
check('fuel cans fill the tank and are used up', v.fuel === 70 && s.storage.gasoline === 0, `(${v.fuel.toFixed(0)} L, ${s.storage.gasoline} cans left)`);
await page.getByRole('button', { name: /^Repair/ }).click();
await page.waitForTimeout(300);
v = await VID(crashId);
s = await S();
check('spare parts mend a vehicle', v.hp === 220 && s.storage.spare_parts === 1, `(hp ${v.hp}, ${s.storage.spare_parts} parts left)`);

// ---- A pickup tows a trailer
const pid = await drive('pickup', 25, 70, 0, 80);
await G(() => window.__game.exitVehicle());
await G(() => window.__game.teleport(27.5, 70));
await page.waitForTimeout(300);
await G(() => { const g = window.__game; g.give('tow_hitch', 1); g.give('trailer', 1); });
const fit = pid;
const jobs = await G(async (id) => {
  const veh = await import('/src/sim/vehicles.ts');
  const st = window.__game.state;
  const x = st.vehicles.find((q) => q.id === id);
  const trailerFirst = veh.fitPart(st, x, 'trailer');
  const hitch = veh.fitPart(st, x, 'tow_hitch');
  const trailer = veh.fitPart(st, x, 'trailer');
  const removeHitch = veh.removePart(st, x, 'tow_hitch');
  return { trailerFirst, hitch, trailer, removeHitch, hasTrailer: !!x.trailer };
}, fit);
check('a trailer needs the tow hitch first', jobs.trailerFirst.ok === false && jobs.hitch.ok && jobs.trailer.ok, JSON.stringify(jobs.trailerFirst));
check('the hitch cannot come off while a trailer is on', jobs.removeHitch.ok === false);
check('the trailer sits behind the pickup', jobs.hasTrailer);
await G((id) => { window.__game.enterVehicle(id); }, fit);
const t0 = await G((id) => window.__game.vehicles().find((q) => q.id === id).trailer, pid);
await G(() => window.__game.drive(1, 0.8, 3));
const t1 = await G((id) => window.__game.vehicles().find((q) => q.id === id), pid);
check('the trailer follows the pickup round a corner', Math.hypot(t1.trailer.x - t1.x, t1.trailer.z - t1.z) > 2.5 && Math.hypot(t1.trailer.x - t1.x, t1.trailer.z - t1.z) < 8 && Math.abs(t1.trailer.heading - t0.heading) > 0.2, JSON.stringify({ t0, car: [t1.x, t1.z, t1.heading], t: t1.trailer }));
await page.screenshot({ path: out + 'veh-trailer.png' });
await leave();

// ---- Cheats
await page.keyboard.press('Backquote');
await page.waitForTimeout(300);
await page.locator('.cheat-console input').fill('endlessfuel');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.locator('.cheat-console input').fill('toughcars');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.keyboard.press('Backquote');
await drive('sedan', 200, 400, 0, 5);
r = await G(() => window.__game.drive(1, 0, 20));
check('ENDLESSFUEL stops fuel being used', r.v.fuel === 5 && !r.ranDry, `(${r.v.fuel})`);
await G(() => window.__game.setVehicle(window.__game.state.driving, { x: 2, z: -14, heading: Math.PI / 2, speed: 0 }));
const hpBefore = (await G(() => window.__game.vehicles().find((q) => q.id === window.__game.state.driving))).hp;
r = await G(() => window.__game.drive(1, 0, 5));
check('TOUGHCARS stops crash damage', r.v.hp === hpBefore, `(${r.v.hp} of ${hpBefore})`);
await leave();

// ---- Saving
await G(() => window.__game.save());
const saved = await G(() => window.__game.vehicles().map((q) => [q.type, Math.round(q.fuel * 10), q.parts.join(',')]));
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(1500);
const loaded = await G(() => window.__game.vehicles().map((q) => [q.type, Math.round(q.fuel * 10), q.parts.join(',')]));
check('vehicles, their fuel and parts survive a reload', JSON.stringify(saved) === JSON.stringify(loaded) && loaded.length >= 8, `(${loaded.length} vehicles)`);

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
