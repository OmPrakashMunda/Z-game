import { chromium } from 'playwright-core';

const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const G = (fn, arg) => page.evaluate(fn, arg);
const audio = () => G(() => window.__game.audio());
const scenery = () => G(() => window.__game.scenery());
const settle = async (ms = 700) => { await G(() => window.__game.settleCamera()); await page.waitForTimeout(ms); };

await page.goto(`http://localhost:${process.env.PORT || 5173}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(700);
await page.evaluate(() => window.__game.survivalOff(true));
await page.waitForTimeout(1500);
await G(() => window.__game.setRain(0)); // keep the weather calm for the first checks

// ---- Sound starts after the first click
let a = await audio();
check('sound engine starts after the first click', a.state === 'running', `(${a.state})`);

// ---- Cars on the road
let s = await scenery();
check('cars are driving on the roads', s.cars >= 12, `(${s.cars} cars)`);
const first = s.snapshot;
await G(() => window.__game.advanceScenery(4));
const second = (await scenery()).snapshot;
const moved = first.filter((c) => second.some((d) => d.id === c.id)).map((c) => {
  const d = second.find((q) => q.id === c.id);
  return Math.hypot(d.x - c.x, d.z - c.z);
});
const avg = moved.reduce((x, y) => x + y, 0) / Math.max(1, moved.length);
check('cars move along the road', moved.length >= 8 && avg > 8, `(${moved.length} cars tracked, average ${avg.toFixed(1)} m in 4 s)`);

// Over a couple of minutes: they wait at red lights and never overlap
let maxStopped = 0;
let minGap = Infinity;
for (let i = 0; i < 120; i++) {
  await G(() => window.__game.advanceScenery(1));
  const t = await scenery();
  maxStopped = Math.max(maxStopped, t.stopped);
  minGap = Math.min(minGap, t.minGap);
}
check('cars stop at red lights', maxStopped >= 1, `(up to ${maxStopped} waiting at once)`);
check('cars keep their distance (no overlaps in 2 minutes)', minGap > 0.3, `(smallest gap ${minGap.toFixed(2)} m)`);

// ---- Camera over town: traffic hum, wind, birds
await G(() => window.__game.snapCamera(0, 8));
await settle(1200);
await page.screenshot({ path: out + 'v1-town-day.png' });
await page.waitForTimeout(9000);
a = await audio();
check('traffic hum is audible in town by day', a.levels.traffic > 0.03, `(level ${a.levels.traffic?.toFixed(3)})`);
check('wind is always present', a.levels.wind > 0.05, `(level ${a.levels.wind?.toFixed(3)})`);
check('birds sing by day', a.stats.birds >= 1, `(${a.stats.birds} songs so far)`);
check('crickets are silent by day', a.levels.crickets < 0.005, `(${a.levels.crickets?.toFixed(4)})`);

// ---- Deep in the woods: more forest, less traffic
await G(() => window.__game.snapCamera(190, -60));
await settle(500);
await page.waitForTimeout(3500);
const woods = await audio();
check('forest rustle is louder in the woods', woods.levels.rustle > a.levels.rustle * 1.5, `(town ${a.levels.rustle?.toFixed(3)}, woods ${woods.levels.rustle?.toFixed(3)})`);
check('traffic hum fades away in the woods', woods.levels.traffic < a.levels.traffic * 0.2, `(woods ${woods.levels.traffic?.toFixed(3)})`);

// ---- Night: crickets, owls, headlights, fireflies, sun/moon indicator
await G(() => window.__game.skipToDay(1, 23));
await G(() => window.__game.advanceScenery(2));
await page.waitForTimeout(3500);
const night = await audio();
s = await scenery();
check('crickets chirp at night', night.levels.crickets > 0.015, `(level ${night.levels.crickets?.toFixed(3)})`);
check('owls call at night', night.stats.owls >= 1, `(${night.stats.owls})`);
check('birds go quiet at night', night.levels.rustle < woods.levels.rustle, '');
check('car headlights come on at night', s.headlights > 1.5, `(glow ${s.headlights.toFixed(2)})`);
check('fireflies appear in the forest at night', s.fireflies === true);
const partNight = await page.locator('.hud .time').getAttribute('title');
check('HUD shows the moon at night', partNight === 'Night', `(${partNight})`);
await settle(800);
await page.screenshot({ path: out + 'v2-woods-night.png' });

await G(() => window.__game.snapCamera(0, 8));
await settle(1000);
await G(() => window.__game.advanceScenery(2));
await page.screenshot({ path: out + 'v3-town-night.png' });

// Quiet roads late at night
await G(() => window.__game.advanceScenery(200));
const lateCars = (await scenery()).cars;
await G(() => window.__game.skipToDay(2, 8));
await G(() => window.__game.advanceScenery(200));
const rushCars = (await scenery()).cars;
check('roads are quieter at night than at rush hour', lateCars < rushCars, `(night ${lateCars}, morning ${rushCars})`);
await page.waitForTimeout(600);
const partDay = await page.locator('.hud .time').getAttribute('title');
check('HUD shows the sun in the morning', partDay === 'Day' || partDay === 'Dawn', `(${partDay})`);

// ---- Rain
await G(() => window.__game.skipToDay(2, 13));
await G(() => window.__game.setRain(1));
await G(() => window.__game.advanceScenery(40));
await page.waitForTimeout(3500);
s = await scenery();
const rainy = await audio();
check('rain falls', s.rain > 0.9, `(${s.rain.toFixed(2)})`);
check('rain is heard', rainy.levels.rain > 0.2, `(level ${rainy.levels.rain?.toFixed(3)})`);
check('thunder rumbles in heavy rain', rainy.stats.thunder >= 1, `(${rainy.stats.thunder})`);
const weatherShown = await page.locator('.hud .weather').isVisible();
check('HUD shows it is raining', weatherShown);
await settle(800);
await page.screenshot({ path: out + 'v4-rain.png' });
await G(() => window.__game.setRain(0));
await G(() => window.__game.advanceScenery(40));
s = await scenery();
check('the rain stops', s.rain < 0.05, `(${s.rain.toFixed(2)})`);

// ---- Sound controls
await page.keyboard.press('KeyM');
await page.waitForTimeout(600);
a = await audio();
check('M mutes the sound', a.muted === true && a.master < 0.02, `(master ${a.master})`);
await page.keyboard.press('KeyM');
await page.waitForTimeout(600);
a = await audio();
check('M turns it back on', a.muted === false && a.master > 0.05, `(master ${a.master?.toFixed(2)})`);
await page.keyboard.press('Escape');
await page.waitForSelector('input.volume');
await page.locator('input.volume').fill('30');
await page.waitForTimeout(400);
a = await audio();
check('menu volume slider changes the volume', Math.abs(a.volume - 0.3) < 0.02, `(${a.volume})`);
await page.screenshot({ path: out + 'v5-menu.png' });
await page.getByText('Resume').click();

// ---- Interface sounds
const before = (await audio()).stats.effects;
await page.keyboard.press('KeyB');
await page.waitForSelector('.modal.shop.online');
await G(() => window.__game.ownPlot('warehouse'));
await page.locator('.item-row:visible', { hasText: 'Wooden picket fence' }).locator('.qbtn', { hasText: '+' }).first().click();
await page.getByRole('button', { name: 'Buy now' }).click();
await page.waitForTimeout(500);
const after = (await audio()).stats.effects;
check('clicks and purchases make sounds', after >= before + 2, `(${before} -> ${after})`);
await page.getByRole('button', { name: 'Close' }).click();

// ---- The world goes quiet when the outbreak starts
await G(() => window.__game.skipToDay(30, 12));
await page.waitForTimeout(2500);
await G(() => window.__game.advanceScenery(300));
await page.waitForTimeout(3500);
s = await scenery();
const dead = await audio();
check('traffic stops after the outbreak', s.cars === 0, `(${s.cars} cars)`);
check('the town goes quiet and uneasy', dead.levels.traffic === 0 && dead.levels.drone > 0.05, `(traffic ${dead.levels.traffic}, drone ${dead.levels.drone})`);
await G(() => window.__game.snapCamera(0, 8));
await settle(1000);
await page.screenshot({ path: out + 'v6-outbreak.png' });

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
