import { chromium } from 'playwright-core';

// Searching houses after the outbreak, carrying what you find, and loading vehicles.
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
const L = () => G(() => window.__game.loot());

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(800);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); window.__game.skipToDay(2, 12); });
await page.waitForTimeout(600);

// Houses to work with: the first few that have something inside, and one with a heavy load
const houses = await G(async () => {
  const gen = await import('/src/world/gen.ts');
  const loot = await import('/src/sim/loot.ts');
  const w = await import('/src/data/weights.ts');
  const seed = window.__game.state.rngSeed;
  const rows = [];
  for (let cx = -3; cx < 4; cx++) {
    for (let cz = -3; cz < 4; cz++) {
      for (const h of gen.housesInChunk(cx, cz)) {
        const { goods, quality } = loot.lootInside(seed, h);
        const door = loot.doorOf(h);
        rows.push({ id: h.id, name: h.name, type: h.houseType, x: h.x, z: h.z, door, goods, kg: w.weightOfAll(goods), quality, dist: Math.hypot(h.x, h.z) });
      }
    }
  }
  // Far and near houses across the whole world, for the quality comparison
  let near = 0, nearN = 0, far = 0, farN = 0;
  for (let cx = -8; cx < 8; cx++) {
    for (let cz = -8; cz < 8; cz++) {
      for (const h of gen.housesInChunk(cx, cz)) {
        const { quality } = loot.lootInside(seed, h);
        const d = Math.hypot(h.x, h.z);
        if (d < 250) { near += quality; nearN++; } else if (d > 450) { far += quality; farN++; }
      }
    }
  }
  const first = rows[0] && loot.lootInside(seed, gen.houseById(rows[0].id));
  return { rows, nearQ: near / nearN, farQ: far / farN, stable: JSON.stringify(first) === JSON.stringify(loot.lootInside(seed, gen.houseById(rows[0].id))) };
});
const filled = houses.rows.filter((r) => Object.keys(r.goods).length > 0 && r.kg <= 24);
const heavy = houses.rows.find((r) => r.kg > 30);
check('what is inside a house is the same every time', houses.stable);
check('houses far from town hold more than those near it', houses.farQ > houses.nearQ + 0.15, `(near ${houses.nearQ.toFixed(2)}, far ${houses.farQ.toFixed(2)})`);
check('plenty of houses have a light load to test with', filled.length >= 5, `(${filled.length} of ${houses.rows.length})`);
const kinds = await G(async () => {
  const w = await import('/src/data/weights.ts');
  return { structure: w.isCarriable('fence_wood'), vehicle: w.isCarriable('sedan'), parts: w.isCarriable('spare_parts'), food: w.isCarriable('canned_food'), pack: w.PACK_KG };
});
check('only supplies can be carried, not structures or vehicles', !kinds.structure && !kinds.vehicle && kinds.parts && kinds.food);

// ---- Before the outbreak nobody lets you in
const first = filled[0];
await G(([x, z]) => window.__game.teleport(x, z), [first.door.x, first.door.z]);
await page.waitForTimeout(500);
check('before the outbreak a house door offers nothing', (await P()).prompt === null);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('and searching does not start', (await L()).searching === null);

// ---- After the outbreak
await G(() => window.__game.skipToDay(30, 9));
await page.waitForTimeout(600);
await G(([x, z]) => window.__game.teleport(x, z), [first.door.x, first.door.z]);
await page.waitForTimeout(500);
let pl = await P();
check('standing at a door offers to search', /^Search the /i.test(pl.prompt ?? ''), JSON.stringify(pl.prompt));
await page.keyboard.press('Space');
await page.waitForTimeout(400);
let loot = await L();
check('Space starts a search', loot.searching && loot.searching.houseId === first.id);
check('a progress bar shows', await page.locator('.house-search').isVisible());
await page.screenshot({ path: out + 'loot-search.png' });
const minutes = loot.searching.total / 60;
check('a search takes a few game minutes', minutes >= 6 && minutes <= 20, `(${minutes} min)`);
await G(() => window.__game.advanceHours(0.5));
await page.waitForTimeout(600);
loot = await L();
check('the search finishes and the house is marked', !loot.searching && !!loot.looted[first.id]);
const packKg = await G(async () => { const w = await import('/src/data/weights.ts'); return w.weightOfAll(window.__game.state.pack); });
check('what was found is in the backpack', JSON.stringify(loot.pack) === JSON.stringify(first.goods), JSON.stringify(loot.pack));
check('the backpack stays within its limit', packKg <= 25, `(${packKg.toFixed(1)} kg)`);
check('the backpack shows in the top bar', await page.locator('.hud .pack').isVisible());
await page.screenshot({ path: out + 'loot-found.png' });
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('a house can only be searched once', (await L()).searching === null && /already searched/i.test(await page.locator('.toast').innerText()));
pl = await P();
check('the door then says it was searched', /Searched/i.test(pl.prompt ?? ''), JSON.stringify(pl.prompt));

// ---- The pack empties into storage at the base
await G(() => window.__game.ownPlot('warehouse'));
await page.waitForTimeout(700);
const stored = await G(() => JSON.parse(JSON.stringify(window.__game.state.storage)));
const after = await L();
check('reaching the base empties the backpack into storage', Object.keys(after.pack).length === 0 && Object.entries(first.goods).every(([id, n]) => (stored[id] ?? 0) >= n), JSON.stringify(stored).slice(0, 120));

// ---- Too much to carry
if (heavy) {
  await G(([x, z]) => window.__game.teleport(x, z), [heavy.door.x, heavy.door.z]);
  await page.waitForTimeout(400);
  await G(() => window.__game.exitVehicle());
  await page.keyboard.press('Space');
  await G(() => window.__game.advanceHours(0.5));
  await page.waitForTimeout(500);
  loot = await L();
  const left = loot.looted[heavy.id]?.left ?? {};
  check('what does not fit stays in the house', Object.keys(left).length > 0, JSON.stringify(left));
  pl = await P();
  check('the door offers to take the rest', /Take the rest/i.test(pl.prompt ?? ''), JSON.stringify(pl.prompt));
  await G(() => { window.__game.state.pack = {}; });
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  loot = await L();
  check('with room again, the rest can be picked up', Object.values(loot.pack).length > 0);
  await G(() => { window.__game.state.pack = {}; });
} else {
  check('(no heavy house nearby to test with)', true);
}

// ---- A vehicle at hand takes the load
const second = filled.find((r) => r.id !== first.id && r.id !== heavy?.id);
await G(([x, z]) => window.__game.teleport(x, z), [second.door.x, second.door.z]);
await page.waitForTimeout(400);
const car = await G(([x, z]) => { const v = window.__game.giveVehicle('pickup'); window.__game.setVehicle(v.id, { x: x + 9, z, heading: 0 }); return v; }, [second.door.x, second.door.z]);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await G(() => window.__game.advanceHours(0.5));
await page.waitForTimeout(500);
const withCar = await G((id) => JSON.parse(JSON.stringify({ cargo: window.__game.vehicles().find((v) => v.id === id).cargo, pack: window.__game.state.pack })), car.id);
check('with a vehicle beside you the goods go into it', JSON.stringify(withCar.cargo) === JSON.stringify(second.goods) && Object.keys(withCar.pack).length === 0, JSON.stringify(withCar.cargo));

// ---- Walking away stops a search
const third = filled.find((r) => r.id !== first.id && r.id !== second.id && r.id !== heavy?.id);
await G(([x, z]) => window.__game.teleport(x, z), [third.door.x, third.door.z]);
await page.waitForTimeout(400);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('a second search starts', (await L()).searching?.houseId === third.id);
await G(([x, z]) => window.__game.teleport(x + 12, z), [third.door.x, third.door.z]);
await page.waitForTimeout(700);
loot = await L();
check('walking away stops the search', loot.searching === null && !loot.looted[third.id]);

// ---- Loading and unloading a vehicle at the base (cargo panel)
await G(() => { window.__game.teleportTo('base'); });
await page.waitForTimeout(500);
await G((id) => { window.__game.setVehicle(id, { x: 25, z: 63, heading: 0, speed: 0 }); window.__game.teleport(27.5, 63); window.__game.snapCamera(25, 63); window.__game.settleCamera(); }, car.id);
await G(() => { const g = window.__game; g.give('rice', 40); g.give('bottled_water', 3); });
await page.waitForTimeout(500);
const pk = await G(([x, z]) => window.__game.project(x, z, 1), [25, 63]);
await page.mouse.move(pk.x, pk.y);
await page.waitForTimeout(200);
await page.mouse.click(pk.x, pk.y);
await page.waitForTimeout(600);
await page.getByRole('button', { name: /Cargo: load and unload/ }).click();
await page.waitForTimeout(500);
check('the cargo panel opens', await page.locator('.cargo-panel').isVisible());
await page.screenshot({ path: out + 'loot-cargo.png' });
const before = await G((id) => window.__game.vehicles().find((v) => v.id === id).cargo, car.id);
await page.locator('.cargo-panel .cargo-line', { hasText: 'Rice' }).locator('.mini-btn', { hasText: '+1' }).click();
await page.waitForTimeout(300);
const afterLoad = await G((id) => ({ cargo: window.__game.vehicles().find((v) => v.id === id).cargo, rice: window.__game.state.storage.rice }), car.id);
check('loading moves goods from storage into the vehicle', (afterLoad.cargo.rice ?? 0) === (before.rice ?? 0) + 1 && afterLoad.rice === 39, JSON.stringify(afterLoad));
await page.locator('.cargo-panel .cargo-line', { hasText: 'Rice' }).locator('.mini-btn', { hasText: 'Max' }).first().click();
await page.waitForTimeout(300);
const weight = await G(async (id) => {
  const c = await import('/src/sim/cargo.ts');
  const v = window.__game.vehicles().find((x) => x.id === id);
  return { kg: c.loadWeight(v), room: c.loadRoom(window.__game.state.vehicles.find((x) => x.id === id)) };
}, car.id);
check('a vehicle only takes what its load space allows', weight.kg <= 450.01 && weight.room >= 0, `(${weight.kg.toFixed(0)} of 450 kg)`);
await page.getByRole('button', { name: 'Unload everything' }).click();
await page.waitForTimeout(300);
const emptied = await G((id) => ({ cargo: window.__game.vehicles().find((v) => v.id === id).cargo, rice: window.__game.state.storage.rice }), car.id);
check('unloading everything puts it all back in storage', Object.keys(emptied.cargo).length === 0 && emptied.rice >= 40, JSON.stringify(emptied));
await G(() => window.__game.teleport(120, 40));
await page.waitForFunction(() => /Park at your base/.test(document.querySelector('.cargo-panel')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
check('away from the base the panel says goods cannot be moved', /Park at your base/.test(await page.locator('.cargo-panel').innerText()));
await page.keyboard.press('Escape');

// ---- Saving
await G(() => window.__game.save());
const savedLoot = await G(() => Object.keys(window.__game.state.looted).sort());
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(1500);
const loadedLoot = await G(() => Object.keys(window.__game.state.looted).sort());
check('searched houses stay searched after a reload', savedLoot.length >= 2 && JSON.stringify(savedLoot) === JSON.stringify(loadedLoot), `(${loadedLoot.length} houses)`);

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
