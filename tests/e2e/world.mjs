import { chromium } from 'playwright-core';
import { newGame, continueGame } from './helpers.mjs';

// The big world: size, streaming, houses, walking, collision, the corner map and saving the player's position.
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

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await newGame(page);
await page.waitForTimeout(800);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); });
await page.waitForTimeout(1200);

// ---- Size and houses (pure data, read straight from the game's own modules)
const data = await G(async () => {
  const city = await import('/src/data/city.ts');
  const gen = await import('/src/world/gen.ts');
  const ids = new Set();
  let houses = 0;
  const types = {};
  const areas = {};
  for (let cx = -8; cx < 8; cx++) {
    for (let cz = -8; cz < 8; cz++) {
      for (const h of gen.housesInChunk(cx, cz)) {
        ids.add(h.id);
        houses++;
        types[h.houseType] = (types[h.houseType] ?? 0) + 1;
        areas[h.area] = (areas[h.area] ?? 0) + 1;
      }
    }
  }
  // The same house comes back from its id
  const sample = gen.housesInChunk(3, 2)[0] ?? gen.housesInChunk(-3, 4)[0];
  const again = sample ? gen.houseById(sample.id) : null;
  return {
    half: city.WORLD_HALF, chunks: gen.CHUNKS_PER_SIDE, houses, unique: ids.size, types, areas,
    sameHouse: !!sample && JSON.stringify(sample) === JSON.stringify(again),
    old: (city.FOREST_BOUNDS?.maxX ?? 265) - (city.FOREST_BOUNDS?.minX ?? -175),
  };
});
const area = (data.half * 2) ** 2;
check('the world is at least 10 times the old playable area (about 440 x 310 m)', area >= 10 * 440 * 310, `(${data.half * 2} x ${data.half * 2} m)`);
check('there are hundreds of houses', data.houses >= 300, `(${data.houses})`);
check('every house has its own id', data.unique === data.houses);
check('a house is rebuilt identically from its id', data.sameHouse);
check('there is more than one kind of house and country', Object.keys(data.types).length >= 4 && Object.keys(data.areas).length >= 3, JSON.stringify({ types: data.types, areas: data.areas }));

// ---- Only the nearby chunks are drawn
let w = await G(() => window.__game.world());
check('chunks near the player are drawn', w.chunks >= 12 && w.chunks <= 60, `(${w.chunks})`);
check('the far end of the world is not drawn', !w.keys.includes('7,7') && !w.keys.includes('-8,-8'));
await G(() => window.__game.teleport(480, 470));
await page.waitForTimeout(800);
w = await G(() => window.__game.world());
check('teleporting draws the new surroundings', w.keys.includes('6,5') && !w.keys.includes('0,0'), `(${w.keys.length} chunks)`);
const perf = await G(() => window.__game.perf());
check('draw calls stay modest far from town', perf.calls < 450, `(${perf.calls} calls, ${perf.triangles} triangles)`);
await page.screenshot({ path: out + 'world-far.png' });
await G(() => window.__game.teleport(-300, -280));
await page.waitForTimeout(800);
w = await G(() => window.__game.world());
check('walking back and forth keeps the count steady', w.chunks <= 60 && w.keys.includes('-4,-4'), `(${w.chunks})`);

// ---- Walking and collision
await G(() => window.__game.teleport(0, 6));
await page.waitForTimeout(500);
const house = await G(async () => {
  const gen = await import('/src/world/gen.ts');
  const city = await import('/src/data/city.ts');
  for (let cx = 1; cx < 6; cx++) {
    for (let cz = 1; cz < 6; cz++) {
      const h = gen.housesInChunk(cx, cz)[0];
      if (h) return { h, f: city.footprint(h) };
    }
  }
  return null;
});
check('found a house to walk into', !!house);
if (house) {
  const { f } = house;
  // Start 9 m to the west of it and walk east into its wall
  await G(([x, z]) => window.__game.teleport(x, z), [f.x - f.w / 2 - 9, f.z]);
  await page.waitForTimeout(600);
  const r = await G(([dx, dz]) => window.__game.walk(dx, dz, 5), [1, 0]);
  const inside = Math.abs(r.x - f.x) < f.w / 2 && Math.abs(r.z - f.z) < f.d / 2;
  check('walls stop the player', !inside && r.x < f.x - f.w / 2 + 0.2, `(x ${r.x.toFixed(1)}, wall at ${(f.x - f.w / 2).toFixed(1)})`);
}
await G(() => window.__game.teleport(400, 0));
const edge = await G(() => window.__game.walk(1, 0, 60, true));
check('the edge of the world stops the player', edge.x < 640 && edge.x > 600, `(x ${edge.x.toFixed(0)})`);

// ---- Trees block you until the land is yours
const woods = await G(async () => {
  const col = await import('/src/world/collide.ts');
  const city = await import('/src/data/city.ts');
  const plot = city.city.plots.find((p) => p.id === 'woods').bounds;
  window.__game.teleport(plot.x, plot.z - 40);
  const treesBefore = col.solidsNear(plot.x, plot.z - plot.d / 2 - 8, 6).filter((r) => r.w < 2).length;
  return { plot, treesBefore };
});
check('there are trees around the woods clearing', woods.treesBefore > 0, `(${woods.treesBefore})`);
await G(() => window.__game.ownPlot('woods'));
await page.waitForTimeout(800);
const after = await G(async ({ plot }) => {
  const col = await import('/src/world/collide.ts');
  return col.solidsNear(plot.x, plot.z, 14).filter((r) => r.w < 2).length;
}, woods);
check('owned land is clear of trees for walking too', after === 0, `(${after} left on the land)`);
const at = await P();
check('standing on the land counts as the base', at.at === 'base');

// ---- Things you build block you, except gates
const placed = await G(() => {
  const g = window.__game;
  const errs = [];
  for (let cx = 2; cx <= 7; cx++) errs.push(g.placeDone('fence_wood', cx, 4, 0));
  errs.push(g.placeDone('gate_wood', 8, 4, 0));
  errs.push(g.placeDone('house_family', 1, 7, 0));
  errs.push(g.placeDone('path_gravel', 10, 8, 0));
  return errs.filter(Boolean);
});
check('the test base was built', placed.length === 0, JSON.stringify(placed));
await G(() => window.__game.teleport(155, -46));
let r = await G(() => window.__game.walk(0, 1, 5));
check('a fence stops the player', r.z < -42, `(z ${r.z.toFixed(1)}, fence at -42)`);
await G(() => window.__game.teleport(165, -46));
r = await G(() => window.__game.walk(0, 1, 6));
check('a gate lets the player through', r.z > -38, `(z ${r.z.toFixed(1)})`);
await G(() => window.__game.teleport(153, -24));
r = await G(() => window.__game.walk(0, -1, 5));
check('a house you built stops the player', r.z > -30.1 && r.z < -26, `(z ${r.z.toFixed(1)}, wall at -30)`);
await G(() => window.__game.teleport(168, -30));
r = await G(() => window.__game.walk(0, -1, 3));
check('a path can be walked over', r.z < -36, `(z ${r.z.toFixed(1)})`);
const carBlocked = await G(async () => {
  const col = await import('/src/world/collide.ts');
  return { fence: col.blockedAt(155, -42, 0.8), gate: col.blockedAt(165, -42, 0.8) };
});
check('vehicles are stopped by the fence too, and pass the gate', carBlocked.fence && !carBlocked.gate, JSON.stringify(carBlocked));
// ---- The corner map and waypoints
check('the corner map is on screen', await page.locator('.minimap canvas').isVisible());
await page.locator('.minimap canvas').click({ position: { x: 120, y: 60 } });
await page.waitForTimeout(300);
const wp = (await P()).waypoint;
check('clicking the map sets a waypoint', !!wp);
check('the waypoint shows in the top bar', await page.locator('.hud .waypoint').isVisible());
await page.locator('.minimap-btn').click();
await page.waitForTimeout(400);
const big = await page.locator('.minimap canvas').boundingBox();
check('the map opens to the whole world', big.width > 300, `(${big.width}px)`);
await page.screenshot({ path: out + 'world-map.png' });
await page.locator('.minimap canvas').click({ position: { x: 180, y: 180 } });
await page.locator('.minimap-btn').click();

// ---- Walking by key, and a shop door prompt
await G(() => window.__game.teleportTo('pharmacy'));
await page.waitForTimeout(500);
const door = await P();
check('the door shows a prompt', /CarePlus/.test(door.prompt ?? ''), JSON.stringify(door.prompt));
check('the prompt is on screen', (await page.locator('.prompt').count()) === 1 && /Space/.test(await page.locator('.prompt').textContent()));
await page.keyboard.press('Space');
await page.waitForSelector('.modal.shop', { timeout: 20000 });
check('Space goes into the shop', true);
await page.getByRole('button', { name: 'Close' }).click();
await G(() => window.__game.teleport(0, 30));
await page.waitForTimeout(400);
check('away from doors there is no prompt', (await page.locator('.prompt').count()) === 0);

// ---- The player's position is saved
await G(() => window.__game.teleport(123.5, -77.5));
await page.waitForTimeout(500);
await G(() => window.__game.save());
await page.reload();
await page.waitForTimeout(2500);
await continueGame(page);
await page.waitForTimeout(1500);
const back = await P();
check('the player is where they were after a reload', Math.abs(back.x - 123.5) < 0.1 && Math.abs(back.z + 77.5) < 0.1, `(${back.x}, ${back.z})`);

// ---- An older save (before walking) is placed at its old place
const migrated = await G(async () => {
  const store = await import('/src/save/store.ts');
  const mk = (at, plotId) => store.migrate({ version: 5, savedAt: 0, state: { worldSeconds: 5000, money: 1, at, plotId, phase: 'prep' } }).pos;
  return { shop: mk('hardware', null), base: mk('base', 'farm'), none: mk(undefined, null) };
});
check('an old save puts the player at the door they were at', Math.abs(migrated.shop.x - -17) < 0.1, JSON.stringify(migrated.shop));
check('an old save at the base puts the player on the plot', Math.abs(migrated.base.x - -55) < 0.1 && Math.abs(migrated.base.z - 64) < 0.1, JSON.stringify(migrated.base));
check('an old save with no place starts at the motel', Math.abs(migrated.none.x - -69) < 0.1, JSON.stringify(migrated.none));

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
