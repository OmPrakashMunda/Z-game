import { chromium } from 'playwright-core';
import { newGame, continueGame } from './helpers.mjs';

// Character creation, seasons, weather on the whole screen, what the weather does to the character, clothes, and the lights.
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
const W = () => G(() => window.__game.weather());
const CLEAR = { rain: 0, snow: 0, storm: 0, cloud: 0.2, wind: 0.2, temp: 20, anomaly: null, anomalyLevel: 0 };
const setW = (o) => G((o) => window.__game.setWeatherOverride(o), o);

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);

// ---- Choosing a character (the screens themselves are tested in title.mjs)
await newGame(page, { name: 'Mara', gender: 'female' });
await page.waitForTimeout(1500);
let st = await G(() => JSON.parse(JSON.stringify({ c: window.__game.state.character, o: window.__game.state.outfit })));
check('the game starts with the name and gender chosen', st.c.name === 'Mara' && st.c.gender === 'female', JSON.stringify(st.c));
check('a new character wears a t-shirt, jeans and sneakers', st.o.body === 'tshirt' && st.o.legs === 'jeans' && st.o.feet === 'sneakers' && !st.o.head && !st.o.hands);
check('the character panel shows the name', (await page.locator('.char-name').innerText()).toLowerCase() === 'mara');
await G(() => window.__game.setRain(0));

// ---- The calendar and the weather as pure data
const data = await G(async () => {
  const wx = await import('/src/sim/weather.ts');
  const fx = await import('/src/render/seasonfx.ts');
  const seed = window.__game.state.rngSeed;
  const same = JSON.stringify(wx.weatherAt(seed, 123456, 0)) === JSON.stringify(wx.weatherAt(seed, 123456, 0));
  const seasons = [];
  let hours = 0, rainy = 0, storms = 0;
  const temps = { spring: [], summer: [], autumn: [], winter: [] };
  let snowWarm = 0, rainCold = 0, heat = 0, cold = 0, maxDayJump = 0, last = null;
  for (let s = 0; s < 4; s++) {
    for (let h = 0; h < 80 * 24; h++) {
      const t = (s * 80 * 24 + h) * 3600;
      const w = wx.weatherAt(seed + s * 7919, t, 0);
      hours++;
      if (w.rain > 0.1 || w.snow > 0.1) rainy++;
      if (w.storm > 0.5) storms++;
      if (w.snow > 0.05 && w.temp >= 1.6) snowWarm++;
      if (w.rain > 0.05 && w.temp < 1.4) rainCold++;
      if (w.anomaly === 'heatwave') heat++;
      if (w.anomaly === 'coldsnap') cold++;
      temps[w.season].push(w.temp);
      if (s === 0) {
        if (seasons[seasons.length - 1] !== w.season) seasons.push(w.season);
        if (h % 24 === 12) {
          if (last !== null) maxDayJump = Math.max(maxDayJump, Math.abs(w.temp - last));
          last = w.temp;
        }
      }
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // How the look changes: one day apart is small, a season apart is large
  const look = (shiftDays) => {
    window.__game.shiftCalendar(shiftDays);
    return null;
  };
  return {
    same, seasons, rainFraction: rainy / hours, storms, snowWarm, rainCold, heat, cold,
    summer: mean(temps.summer), winter: mean(temps.winter), spring: mean(temps.spring), autumn: mean(temps.autumn), maxDayJump,
    days: wx.SEASON_DAYS, look: look(0),
  };
});
check('the weather is the same every time for the same moment', data.same);
check('a year is spring, summer, autumn, winter in turn', data.seasons.join() === 'spring,summer,autumn,winter' || data.seasons.length >= 4, data.seasons.join());
check('each season lasts 20 days', data.days === 20);
check('summer is much warmer than winter', data.summer > data.winter + 15, `(summer ${data.summer.toFixed(1)}, winter ${data.winter.toFixed(1)}, spring ${data.spring.toFixed(1)}, autumn ${data.autumn.toFixed(1)})`);
check('the temperature changes gently from day to day', data.maxDayJump < 10, `(${data.maxDayJump.toFixed(1)} degrees)`);
check('it rains or snows part of the time, not all of it', data.rainFraction > 0.12 && data.rainFraction < 0.5, `(${(data.rainFraction * 100).toFixed(0)}%)`);
check('there are thunderstorms', data.storms > 20, `(${data.storms} hours in 4 years)`);
check('it only snows when it is freezing, and rains when it is not', data.snowWarm === 0 && data.rainCold === 0);
check('there are heatwaves and cold snaps', data.heat > 5 && data.cold > 5, `(${data.heat} and ${data.cold} hours)`);

// The look of each season, and how slowly it moves
const look = async (phase) => {
  await G((p) => { const g = window.__game; g.shiftCalendar((p - g.weather().w.yearPhase) * 80); }, phase);
  await page.waitForTimeout(700);
  return G(async () => {
    const fx = await import('/src/render/seasonfx.ts');
    return { oak: fx.seasonUniforms.oak.value.w, pine: fx.seasonUniforms.pine.value.w, snow: fx.seasonUniforms.snow.value, season: window.__game.weather().w.season };
  });
};
const summer = await look(0.37);
const autumn = await look(0.62);
const winter = await look(0.87);
const spring = await look(0.12);
check('summer leaves are plain green', summer.season === 'summer' && summer.oak < 0.05 && summer.snow < 0.1, JSON.stringify(summer));
check('autumn leaves turn gold', autumn.season === 'autumn' && autumn.oak > 0.5, JSON.stringify(autumn));
check('winter trees are bare and the ground is white', winter.season === 'winter' && winter.oak > 0.6 && winter.snow > 0.6, JSON.stringify(winter));
check('spring is fresh', spring.season === 'spring' && spring.snow < 0.3);
const a = await look(0.5);
const b = await look(0.5125);
check('the change from one day to the next is tiny', Math.abs(a.oak - b.oak) < 0.08, `(${a.oak.toFixed(3)} to ${b.oak.toFixed(3)})`);

// ---- The top bar
await look(0.37);
const chip = await page.locator('.hud .weather').innerText();
check('the top bar shows the season, temperature and sky', /^(Spring|Summer|Autumn|Winter), -?\d+\u00b0C, \w+/.test(chip.trim()), JSON.stringify(chip));
const bar = await G(() => { const r = document.querySelector('.hud > button:last-of-type').getBoundingClientRect(); return { right: r.right, width: window.innerWidth }; });
check('the whole top bar fits on screen', bar.right <= bar.width, JSON.stringify(bar));

// ---- Rain covers the whole screen, however the view is turned
const diffRegions = async (bufA, bufB) => G(async ([a, b]) => {
  const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x; };
  const ca = px(ia), cb = px(ib);
  const regions = { topLeft: [350, 70, 340, 250], topRight: [700, 70, 540, 250], bottomLeft: [350, 330, 340, 260], bottomRight: [700, 330, 360, 260] };
  const res = {};
  for (const [name, [x, y, w, h]] of Object.entries(regions)) {
    const da = ca.getImageData(x, y, w, h).data, db = cb.getImageData(x, y, w, h).data;
    let brighter = 0;
    for (let i = 0; i < da.length; i += 4) {
      const la = da[i] * 0.3 + da[i + 1] * 0.59 + da[i + 2] * 0.11;
      const lb = db[i] * 0.3 + db[i + 1] * 0.59 + db[i + 2] * 0.11;
      if (lb - la > 28) brighter++;
    }
    res[name] = brighter;
  }
  return res;
}, [bufA.toString('base64'), bufB.toString('base64')]);
await G(() => { window.__game.teleport(200, 100); window.__game.skipToDay(1, 13); });
await setW({ ...CLEAR });
await page.waitForTimeout(3500);
const dry = await page.screenshot();
await setW({ ...CLEAR, rain: 0.9, cloud: 0.9 });
await page.waitForTimeout(16000);
const wet = await page.screenshot();
await page.screenshot({ path: out + 'weather-rain.png' });
let regions = await diffRegions(dry, wet);
check('rain falls over every part of the screen', Object.values(regions).every((n) => n > 150), JSON.stringify(regions));
await G(() => window.__game.turnView(90));
await G(() => window.__game.settleCamera());
await setW({ ...CLEAR });
await page.waitForTimeout(16000);
const dry2 = await page.screenshot();
await setW({ ...CLEAR, rain: 0.9, cloud: 0.9 });
await page.waitForTimeout(16000);
const wet2 = await page.screenshot();
regions = await diffRegions(dry2, wet2);
check('and still does when the view is turned', Object.values(regions).every((n) => n > 150), JSON.stringify(regions));
await G(() => window.__game.turnView(-90));
await G(() => window.__game.settleCamera());

// ---- A thunderstorm has lightning
await setW({ ...CLEAR, rain: 1, storm: 1, cloud: 1, wind: 0.9 });
const strikes0 = await G(() => window.__game.scenery().strikes);
let strikes = strikes0;
for (let i = 0; i < 150 && strikes < strikes0 + 1; i++) {
  await page.waitForTimeout(1000);
  strikes = await G(() => window.__game.scenery().strikes);
}
check('a thunderstorm brings lightning', strikes > strikes0, `(${strikes - strikes0} strikes)`);
await page.screenshot({ path: out + 'weather-storm.png' });

// ---- What the weather does to the character. Outside, rain slowly costs health.
await setW({ ...CLEAR, rain: 0.8, cloud: 0.8 });
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.health = 100; g.state.wet = 0; });
await page.waitForTimeout(800);
check('the test spot is out in the open', (await G(() => window.__game.player())).at === 'outside');
await G(() => window.__game.advanceHours(3));
let h = await G(() => ({ hp: window.__game.state.player.health, wet: window.__game.state.wet }));
const lossBare = 100 - h.hp;
check('rain outside slowly takes health', lossBare > 0.8 && lossBare < 5, `(${lossBare.toFixed(2)} health in 3 hours)`);
check('and soaks you', h.wet > 0.5, `(${h.wet.toFixed(2)})`);
await G(() => window.__game.teleportTo('hardware'));
await G(() => { window.__game.state.player.health = 100; });
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(3));
h = await G(() => ({ hp: window.__game.state.player.health, wet: window.__game.state.wet }));
check('at a shop door the rain does nothing, and you dry off', h.hp === 100 && h.wet < 0.3, JSON.stringify(h));

// Closed and open vehicles
await G(() => { window.__game.teleport(0, 30); });
const car = await G(() => window.__game.giveVehicle('sedan'));
const bike = await G(() => window.__game.giveVehicle('bicycle'));
await G(([id]) => window.__game.setVehicle(id, { x: 3, z: 30 }), [car.id]);
await G(() => window.__game.enterVehicle(1 + 0));
await G(([id]) => window.__game.enterVehicle(id), [car.id]);
await page.waitForTimeout(600);
await G(() => { window.__game.state.player.health = 100; window.__game.state.wet = 0; });
await G(() => window.__game.advanceHours(2));
h = await G(() => window.__game.state.player.health);
check('a closed car keeps the rain off', h === 100, `(${h})`);
await G(() => { const g = window.__game; g.setVehicle(g.state.driving, { speed: 0 }); g.exitVehicle(); });
await G(([id]) => { const g = window.__game; g.setVehicle(id, { x: g.state.pos.x + 2, z: g.state.pos.z }); g.enterVehicle(id); }, [bike.id]);
await page.waitForTimeout(600);
await G(() => { window.__game.state.player.health = 100; window.__game.state.wet = 0; });
await G(() => window.__game.advanceHours(2));
h = await G(() => window.__game.state.player.health);
check('a bicycle leaves you in it', h < 100, `(${h.toFixed(2)})`);
await G(() => { const g = window.__game; g.setVehicle(g.state.driving, { speed: 0 }); g.exitVehicle(); });

// Clothes make the difference. Wear a full set of rain gear from storage at the base, then go back out.
await G(() => { const g = window.__game; g.ownPlot('farm'); for (const id of ['rain_hat', 'raincoat', 'rain_pants', 'rubber_boots', 'work_gloves', 'parka', 'thermal_pants', 'winter_boots', 'winter_gloves', 'wool_beanie', 'jacket']) g.give(id, 1); });
await page.waitForTimeout(700);
for (const id of ['rain_hat', 'raincoat', 'rain_pants', 'rubber_boots', 'work_gloves']) await G((id) => window.__game.wear(id), id);
const gear = await G(() => window.__game.weather());
check('wearing rain gear raises dryness a lot', gear.e.dry > 0.6, `(dry ${(gear.e.dry * 100).toFixed(0)}%)`);
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.health = 100; g.state.wet = 0; });
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(3));
h = await G(() => ({ hp: window.__game.state.player.health, wet: window.__game.state.wet }));
const lossGear = 100 - h.hp;
check('rain gear cuts the damage to a fraction', lossGear < lossBare * 0.45, `(${lossGear.toFixed(2)} against ${lossBare.toFixed(2)})`);
check('and keeps you much drier', h.wet < 0.5, `(${h.wet.toFixed(2)})`);

// Cold
await G(() => { window.__game.teleport(0, 30); });
await G(() => window.__game.teleportTo('base'));
for (const slot of ['head', 'body', 'legs', 'hands', 'feet']) await G((s) => window.__game.takeOff(s), slot);
await G(() => { window.__game.state.storage.tshirt = 0; });
await setW({ ...CLEAR, snow: 0.6, cloud: 0.9, temp: -8, wind: 0.5 });
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.health = 100; g.state.wet = 0; });
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(2));
const coldBare = 100 - (await G(() => window.__game.state.player.health));
check('freezing weather hurts without warm clothes', coldBare > 2.5, `(${coldBare.toFixed(2)} in 2 hours)`);
await G(() => window.__game.teleportTo('base'));
await page.waitForTimeout(500);
for (const id of ['wool_beanie', 'parka', 'thermal_pants', 'winter_gloves', 'winter_boots']) await G((id) => window.__game.wear(id), id);
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.health = 100; g.state.wet = 0; });
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(2));
const coldGear = 100 - (await G(() => window.__game.state.player.health));
check('winter clothes keep the cold out', coldGear < 0.8 && coldGear < coldBare * 0.3, `(${coldGear.toFixed(2)} against ${coldBare.toFixed(2)})`);

// Heat
await setW({ ...CLEAR, temp: 38 });
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.thirst = 100; g.state.player.health = 100; });
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(3));
const thirst = await G(() => window.__game.state.player.thirst);
check('a heatwave makes you thirsty out in the open', thirst < 92, `(${thirst.toFixed(1)})`);

// Lightning
await setW({ ...CLEAR, rain: 1, storm: 1 });
await G(() => { const g = window.__game; g.teleport(0, 30); g.state.player.health = 100; g.state.wet = 0; });
await page.waitForTimeout(800);
const far = await G(() => window.__game.strike(25));
const near = await G(() => window.__game.strike(2));
const afterHit = await G(() => window.__game.state.player.health);
check('a strike far away does nothing, a strike beside you hurts', far === 0 && near >= 30 && afterHit <= 70, `(${near} damage, ${afterHit} health left)`);
await G(() => window.__game.teleportTo('hardware'));
await page.waitForTimeout(700);
const safe = await G(() => window.__game.strike(1));
check('under cover lightning cannot hurt you', safe === 0);

// Dying of exposure
await setW({ ...CLEAR, snow: 1, storm: 1, temp: -20, wind: 1 });
await G(() => {
  const g = window.__game;
  for (const s of ['head', 'body', 'legs', 'hands', 'feet']) g.takeOff(s);
  g.teleport(0, 30);
  g.state.player.health = 6;
  g.state.wet = 0;
});
await page.waitForTimeout(800);
await G(() => window.__game.advanceHours(4));
const dead = await G(() => ({ phase: window.__game.state.phase, last: window.__game.state.messages.at(-1)?.text }));
check('the cold can kill', dead.phase === 'dead' && /froze/i.test(dead.last ?? ''), JSON.stringify(dead));
await page.reload();
await page.waitForTimeout(2500);

// ---- Starting a new game for the rest
await newGame(page);
await page.waitForTimeout(1500);
await G(() => window.__game.setWeatherOverride({ rain: 0, snow: 0, storm: 0, cloud: 0.2, temp: 18, anomaly: null, anomalyLevel: 0 }));

// ---- Clothes: shops, loot, the character panel
const shop = await G(async () => {
  const s = await import('/src/data/stores.ts');
  const info = await import('/src/data/info.ts');
  const c = await import('/src/data/clothing.ts');
  const w = await import('/src/data/weights.ts');
  return {
    hardware: s.STORES.hardware.stock.some(([id]) => id === 'jacket'),
    online: Object.keys(c.CLOTHING).every((id) => s.STORES.online.stock.some(([x]) => x === id)),
    sheet: info.productInfo('raincoat').stats.map((x) => x.label),
    carriable: w.isCarriable('parka'),
    count: Object.keys(c.CLOTHING).length,
  };
});
check('clothes are sold in the shops and the online store', shop.hardware && shop.online, `(${shop.count} items)`);
check('the product sheet shows where it is worn, its warmth and dryness', ['Worn on', 'Warmth', 'Keeps you dry'].every((l) => shop.sheet.includes(l)), JSON.stringify(shop.sheet));
check('clothes can be carried', shop.carriable);
const lootClothes = await G(async () => {
  const gen = await import('/src/world/gen.ts');
  const loot = await import('/src/sim/loot.ts');
  const c = await import('/src/data/clothing.ts');
  const seen = new Set();
  for (let cx = -4; cx < 4; cx++) for (let cz = -4; cz < 4; cz++) for (const h of gen.housesInChunk(cx, cz)) for (const id of Object.keys(loot.lootInside(window.__game.state.rngSeed, h).goods)) if (c.CLOTHING[id]) seen.add(id);
  return [...seen];
});
check('houses hold clothes to find', lootClothes.length >= 5, `(${lootClothes.length} kinds)`);

await G(() => { const g = window.__game; g.ownPlot('farm'); g.give('raincoat', 1); g.give('hiking_boots', 1); g.give('parka', 1); });
await page.waitForTimeout(1200);
await page.locator('.char-head').click();
await page.waitForTimeout(400);
check('the panel lists the five clothing slots', (await page.locator('.char-slot').count()) === 5);
const before = await G(() => window.__game.weather());
await page.locator('.char-slot', { hasText: 'Body' }).click();
await page.waitForTimeout(300);
await page.locator('.char-picker').getByRole('button', { name: 'Wear' }).first().click();
await page.waitForTimeout(500);
const after = await G(() => ({ w: window.__game.weather(), storage: window.__game.state.storage }));
check('picking a coat puts it on and returns the old one to storage', ['raincoat', 'parka'].includes(after.w.outfit.body) && after.storage.tshirt === 1, JSON.stringify(after.w.outfit));
check('the warmth and dryness meters follow', after.w.e.dry > before.e.dry || after.w.e.warmth > before.e.warmth, `(${(before.e.dry * 100).toFixed(0)} to ${(after.w.e.dry * 100).toFixed(0)}% dry)`);
check('the numbers are on screen', /\d+%/.test(await page.locator('.char-meters').innerText()));
await page.screenshot({ path: out + 'weather-panel.png' });
await G(() => window.__game.teleport(0, 30));
await page.waitForTimeout(500);
const away = await G(() => window.__game.wear('hiking_boots'));
check('away from the base you cannot wear what is in storage', away && away.ok === false);

// ---- Floodlights and lamps light up the base at night
await G(() => {
  const g = window.__game;
  g.ownPlot('farm');
  g.setRain(0);
  const errs = [];
  for (const [t, cx, cz] of [['solar_array', 4, 10], ['battery_bank', 7, 10], ['lamp_post', 9, 10], ['lamp_post', 9, 13], ['floodlight_tower', 3, 13]]) errs.push(g.placeDone(t, cx, cz, 0));
  g.skipToDay(2, 23);
  const b = g.state.pieces.find((p) => p.type === 'battery_bank');
  b.level = 20;
  g.refreshSurvival();
  return errs;
});
await page.waitForTimeout(2500);
const lights = await G(() => window.__game.scenery().lights);
check('only the lamps that have power count as lights', lights.sources === 3, JSON.stringify(lights));
check('lit lamps and floodlights light the ground and the surroundings', lights.real >= 1 && lights.pools >= 3, JSON.stringify(lights));
await G(() => window.__game.skipToDay(3, 12));
await page.waitForTimeout(2000);
const day = await G(() => window.__game.scenery().lights);
check('by day the lights are off', day.real === 0, JSON.stringify(day));

// ---- Saving
await G(() => { const g = window.__game; g.shiftCalendar(7); g.state.wet = 0.4; g.wear('parka'); });
const savedWx = await G(() => ({ c: window.__game.state.character, o: window.__game.state.outfit, s: window.__game.state.calendarShift, w: window.__game.state.wet }));
await G(() => window.__game.save());
await page.reload();
await page.waitForTimeout(2500);
await continueGame(page);
await page.waitForTimeout(1500);
const loaded = await G(() => ({ c: window.__game.state.character, o: window.__game.state.outfit, s: window.__game.state.calendarShift, w: window.__game.state.wet }));
check('name, clothes, wetness and the calendar survive a reload', JSON.stringify(savedWx.c) === JSON.stringify(loaded.c) && JSON.stringify(savedWx.o) === JSON.stringify(loaded.o) && savedWx.s === loaded.s && Math.abs(savedWx.w - loaded.w) < 0.1, JSON.stringify(loaded));
const old = await G(async () => {
  const store = await import('/src/save/store.ts');
  const s = store.migrate({ version: 8, savedAt: 0, state: { worldSeconds: 5000, money: 1, phase: 'prep' } });
  return { c: s.character, o: s.outfit, w: s.wet };
});
check('an old save gets a default survivor in a plain outfit', old.c.name === 'Survivor' && old.o.body === 'tshirt' && old.w === 0, JSON.stringify(old.c));

console.log('--- console errors/warnings ---');
console.log(errors.length ? errors.join('\n') : 'none');
await browser.close();
