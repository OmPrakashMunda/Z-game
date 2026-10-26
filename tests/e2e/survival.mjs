import { chromium } from 'playwright-core';
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const PORT = process.env.PORT || '5173';
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
const near = (v, lo, hi) => v >= lo && v <= hi;

async function fresh() {
  await page.goto(`http://localhost:${PORT}/?quality=low`);
  await page.waitForTimeout(2500);
  await page.getByText('New Game').click();
  const confirm = page.getByText('Start new game');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(1200);
  await G(() => { window.__game.setRain(0); window.__game.ownPlot('warehouse'); window.__game.state.at = 'base'; });
}
const place = async (type, cx, cz) => {
  const err = await G(([t, x, z]) => window.__game.placeDone(t, x, z, 0), [type, cx, cz]);
  if (err) console.log(`   (could not place ${type} at ${cx},${cz}: ${err})`);
  return err === null;
};
const adv = (h) => G((n) => window.__game.advanceHours(n), h);
const toDay = (d, h) => G(([a, b]) => window.__game.skipToDay(a, b), [d, h]);
const refresh = () => G(() => window.__game.refreshSurvival());
const S = () => G(() => JSON.parse(JSON.stringify(window.__game.state)));
const issues = () => G(() => window.__game.issues());
const pieceIdOf = (st, type) => st.pieces.find((p) => p.type === type)?.id;
const has = (iss, id, code) => (iss[id] ?? []).includes(code);

// =============================================================== 1. The family's needs
await fresh();
await adv(1);
let st = await S();
let first = await G(() => window.__game.summary());
check('moving in hands over food and water for about 6 days', near(first.food.reserve, 70, 72) && near(first.water.reserve, 70, 72), JSON.stringify({ meals: first.food.reserve, litres: first.water.reserve }));
await adv(24);
let sum = await G(() => window.__game.summary());
check('the family drinks 12 L a day', near(sum.water.reserve, 58, 61), `(reserve ${sum.water.reserve.toFixed(1)} L)`);
check('the family eats 12 meals a day', near(sum.food.reserve, 58, 61), `(reserve ${sum.food.reserve.toFixed(1)} meals)`);
st = await S();
check('meters stay full while supplies last', st.player.thirst >= 99 && st.player.hunger >= 99 && st.player.health >= 99, JSON.stringify(st.player));
check('days of supplies are reported', near(sum.water.days, 4.5, 5.5) && near(sum.food.days, 4.5, 5.5), `(water ${sum.water.days.toFixed(1)} d, food ${sum.food.days.toFixed(1)} d)`);

await G(() => { const s = window.__game.state; delete s.storage.canned_food; delete s.storage.bottled_water; s.survival.mealBuffer = 0; s.survival.waterBuffer = 0; });
await adv(30);
await refresh();
st = await S();
check('without water thirst falls first', near(st.player.thirst, 10, 25) && st.player.hunger > 50, `(thirst ${st.player.thirst.toFixed(0)}, hunger ${st.player.hunger.toFixed(0)})`);
let adviceNow = await G(() => window.__game.advice());
check('the advisor raises an urgent alert', adviceNow.alerts.some((a) => a.severity === 'bad'), JSON.stringify(adviceNow.alerts.map((a) => a.id)));
check('the vitals card shows the warning', await page.locator('.vitals').isVisible() && (await page.locator('.vitals-banner').isVisible()));
await page.screenshot({ path: out + 'sv1-thirsty.png' });
await adv(30);
st = await S();
const lastWarn = [...st.messages].reverse().find((m) => m.kind === 'warning');
check('the family dies of thirst', st.phase === 'dead' && /thirst/.test(lastWarn?.text ?? ''), `(phase ${st.phase})`);
await page.waitForTimeout(900);
check('a game over card appears', await page.getByText('did not survive').first().isVisible());
await page.screenshot({ path: out + 'sv2-dead.png' });

// =============================================================== 2. Water: wells, tanks and pipes
await fresh();
// Build the scene with survival paused, so the live game loop cannot tick between the steps of this test
await G(() => window.__game.survivalOff(true));
await place('well_hand', 2, 2);
await place('water_tank', 4, 2);   // 2 m from the well: joined
await place('water_tank', 12, 2);  // far away: not joined
await G(() => window.__game.survivalOff(false));
await adv(0.1);
await refresh();
st = await S();
let iss = await issues();
const wellId = pieceIdOf(st, 'well_hand');
const tanks = st.pieces.filter((p) => p.type === 'water_tank');
check('a tank next to the well is joined to it', !has(iss, tanks[0].id, 'tank_unfilled'), JSON.stringify(iss[tanks[0].id] ?? []));
check('a tank too far away warns that nothing fills it', has(iss, tanks[1].id, 'tank_unfilled'));
await adv(5);
st = await S();
const near1 = st.pieces.filter((p) => p.type === 'water_tank')[0];
const far1 = st.pieces.filter((p) => p.type === 'water_tank')[1];
check('the well fills the joined tank', near(near1.level ?? 0, 50, 62), `(${(near1.level ?? 0).toFixed(1)} L after 5 h)`);
check('the far tank stays empty', (far1.level ?? 0) < 0.01);
check('bottled water is untouched while the tank supplies the family', st.storage.bottled_water === 2);
await place('pipe_post', 7, 2);
await adv(0.1);
await refresh();
iss = await issues();
check('a pipe junction joins the far tank', !has(iss, far1.id, 'tank_unfilled'), JSON.stringify(iss[far1.id] ?? []));
await adv(5);
st = await S();
const far2 = st.pieces.filter((p) => p.type === 'water_tank')[1];
check('then the far tank fills too', (far2.level ?? 0) > 5, `(${(far2.level ?? 0).toFixed(1)} L)`);
sum = await G(() => window.__game.summary());
check('a working well makes the family self-sufficient in water', sum.water.sustained && sum.counts.cleanWaterSources === 1 && sum.counts.tanks === 2, JSON.stringify(sum.counts));
await page.screenshot({ path: out + 'sv3-water.png' });

// =============================================================== 3. Power: sources, batteries, poles
await fresh();
await toDay(1, 10);
await place('lamp_post', 2, 8);
await place('lamp_post', 11, 8);
await adv(0.1);
await refresh();
st = await S();
iss = await issues();
const lampA = st.pieces.filter((p) => p.type === 'lamp_post')[0];
const lampB = st.pieces.filter((p) => p.type === 'lamp_post')[1];
check('a lamp with no power source warns that it is not connected', has(iss, lampA.id, 'no_link'), JSON.stringify(iss[lampA.id] ?? []));
let stats = await G(() => window.__game.scenery().pieces);
check('a warning sign floats above it', stats.warnings === 2, `(${stats.warnings} signs)`);
await place('solar_panel', 3, 8);
await place('battery_bank', 4, 8);
await place('solar_panel', 10, 8);
await toDay(1, 17);
await refresh();
st = await S();
const bat = st.pieces.find((p) => p.type === 'battery_bank');
check('solar panels charge the battery by day', (bat.level ?? 0) > 1.2, `(${(bat.level ?? 0).toFixed(2)} kWh)`);
iss = await issues();
check('the connected lamp has no warning', !(iss[lampA.id] ?? []).length, JSON.stringify(iss[lampA.id] ?? []));
await toDay(2, 3);
await refresh();
st = await S();
iss = await issues();
const bat2 = st.pieces.find((p) => p.type === 'battery_bank');
check('the battery runs the lamp through the night', (bat2.level ?? 0) > 0.3 && (bat2.level ?? 0) < (bat.level ?? 0), `(${(bat.level ?? 0).toFixed(2)} -> ${(bat2.level ?? 0).toFixed(2)} kWh)`);
check('the lamp with the battery has no warning at night', !(iss[lampA.id] ?? []).length);
check('the lamp with only a solar panel runs short at night', has(iss, lampB.id, 'low_power'), JSON.stringify(iss[lampB.id] ?? []));
await page.screenshot({ path: out + 'sv4-power-night.png' });
await place('lamp_post', 12, 1);
await adv(0.1);
await refresh();
iss = await issues();
st = await S();
const lampC = st.pieces.filter((p) => p.type === 'lamp_post')[2];
check('a lamp far from everything is not connected', has(iss, lampC.id, 'no_link'));
await place('power_pole', 7, 2);
await adv(0.1);
await refresh();
iss = await issues();
check('a power pole reaches it', !has(iss, lampC.id, 'no_link'), JSON.stringify(iss[lampC.id] ?? []));
stats = await G(() => window.__game.scenery().pieces);
check('dashed lines show the connections', stats.links >= 5, `(${stats.links} links)`);
await page.screenshot({ path: out + 'sv5-poles.png' });
await page.evaluate(() => window.__game.save());
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(1500);
st = await S();
check('battery charge survives save and reload', st.pieces.some((p) => p.type === 'battery_bank' && (p.level ?? 0) > 0.3) && st.version === 6);

// =============================================================== 4. Generators and fuel
await fresh();
await toDay(1, 21);
await place('generator_5kw', 2, 2);
await place('lamp_post', 3, 2);
await adv(1);
await refresh();
st = await S();
iss = await issues();
const gen = st.pieces.find((p) => p.type === 'generator_5kw');
check('a generator with no fuel warns', has(iss, gen.id, 'no_fuel'), JSON.stringify(iss[gen.id] ?? []));
await G(() => window.__game.give('gasoline', 1));
await adv(2);
await refresh();
st = await S();
iss = await issues();
check('with fuel the generator runs and burns a little', st.survival.fuelBuffer > 19 && st.survival.fuelBuffer < 20 && !(iss[gen.id] ?? []).length, `(buffer ${st.survival.fuelBuffer.toFixed(3)} L)`);

// =============================================================== 5. Farms need seeds and water
await fresh();
await place('well_hand', 5, 2);
await place('garden_bed', 2, 2);
await place('garden_bed', 10, 8);
await adv(0.1);
await refresh();
st = await S();
iss = await issues();
const gardens = st.pieces.filter((p) => p.type === 'garden_bed');
check('a garden without seeds says so', has(iss, gardens[0].id, 'no_seeds'));
check('a garden far from water says so', has(iss, gardens[1].id, 'no_link'));
await G(() => window.__game.give('seeds_veg', 3));
await adv(6);
await refresh();
iss = await issues();
check('with seeds and water the garden grows', !(iss[gardens[0].id] ?? []).length, JSON.stringify(iss[gardens[0].id] ?? []));
await adv(5 * 24);
st = await S();
check('the garden is harvested into fresh food', (st.storage.fresh_food ?? 0) >= 3, `(${st.storage.fresh_food ?? 0} baskets)`);
check('seeds are used up for each crop', (st.storage.seeds_veg ?? 0) <= 2, `(${st.storage.seeds_veg ?? 0} left)`);
sum = await G(() => window.__game.summary());
check('farms count toward food production', sum.counts.workingFarms === 1 && sum.food.makePerDay > 3, JSON.stringify({ farms: sum.counts.workingFarms, perDay: sum.food.makePerDay }));

// =============================================================== 6. The advisor
await fresh();
await refresh();
let ad = await G(() => window.__game.advice());
const cur = (a) => a.steps.find((s) => s.state === 'current')?.id;
check('the advisor starts with water', cur(ad) === 'water', cur(ad));
check('it offers to buy a well', ad.steps[0].actions.some((a) => a.kind === 'buy' && a.item === 'well_hand'));
check('the advisor panel is on screen', await page.locator('.advisor').isVisible() && (await page.locator('.advisor .step-title').innerText()).toLowerCase().includes('water'));
await page.screenshot({ path: out + 'sv6-advisor.png' });
await place('well_hand', 2, 2);
await refresh();
ad = await G(() => window.__game.advice());
check('after a well it asks for a tank', cur(ad) === 'tank', cur(ad));
await place('water_tank', 4, 2);
await refresh();
ad = await G(() => window.__game.advice());
check('after a tank it asks for food', cur(ad) === 'food', cur(ad));
await place('garden_bed', 7, 2);
await G(() => window.__game.give('seeds_veg', 3));
await adv(1);
await refresh();
ad = await G(() => window.__game.advice());
check('after a working garden it moves on to power', cur(ad) === 'power', cur(ad));
check('the checklist shows the finished steps', ad.steps.filter((s) => s.state === 'done').length === 4, ad.steps.map((s) => s.id + ':' + s.state).join(' '));

// The Buy button spends money and starts placing
await G(() => { window.__game.setMoney(100000); });
await refresh();
await page.locator('.advisor .step-actions .mini-btn', { hasText: 'solar' }).first().click();
await page.waitForTimeout(800);
st = await S();
check('the advisor buy button buys and starts building', (st.storage.solar_panel ?? 0) === 2 && st.money < 100000 && (await page.locator('.placing-bar').isVisible()), `(solar ${st.storage.solar_panel ?? 0})`);
await page.screenshot({ path: out + 'sv7-buy.png' });

console.log(errors.length ? '--- console errors ---\n' + errors.join('\n') : 'no console errors');
await browser.close();
