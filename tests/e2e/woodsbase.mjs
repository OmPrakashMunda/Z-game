import { chromium } from 'playwright-core';
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

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(1500);
await G(() => window.__game.setRain(0));

const start = await G(() => ({ money: window.__game.state.money, plot: window.__game.state.plotId, pieces: window.__game.state.pieces.length }));
console.log('start', JSON.stringify(start));

// The architect panel on a bare woods plot offers to buy land first (checked before the cheat)
await G(() => { const g = window.__game; g.ownPlot('woods'); g.state.at = 'base'; });
const preview = await G(async () => {
  const a = await import('/src/sim/architect.ts');
  const p = a.planBase(window.__game.state);
  return { land: p.land, cost: p.cost, lines: p.lines.filter((l) => l.group === 'land' || l.type === 'canned_food' || l.type === 'bottled_water').map((l) => `${l.type} ${l.qty} $${l.total}`), notes: p.notes, ok: p.outcome.ok, problems: p.outcome.problems };
});
console.log('woods plan preview', JSON.stringify(preview));
check('on the small woods plot the plan buys land first', preview.land.sides.length >= 3 && preview.land.cost > 50000, JSON.stringify(preview.land));
check('the land is bought on the sides that are open (never west)', !preview.land.sides.includes('w'), JSON.stringify(preview.land.sides));
check('the plan includes a week of food and water', preview.lines.some((l) => l.startsWith('canned_food')) && preview.lines.some((l) => l.startsWith('bottled_water')), JSON.stringify(preview.lines));
check('the woods design passes its own test', preview.ok === true, JSON.stringify(preview.problems));
// back to a bare game
await G(() => { const g = window.__game; g.state.plotId = null; g.state.expansion = { n: 0, e: 0, s: 0, w: 0 }; g.state.at = 'motel'; });

// The cheat
await page.keyboard.press('Backquote');
await page.waitForTimeout(400);
await page.keyboard.type('woodsbase');
await page.keyboard.press('Enter');
await page.waitForTimeout(6000);
console.log('console says:', await page.locator('.cheat-result').innerText());
const s = await G(() => {
  const st = window.__game.state;
  window.__game.refreshSurvival();
  return {
    plot: st.plotId, expansion: st.expansion, money: st.money, at: st.at,
    pieces: st.pieces.length, unfinished: st.pieces.filter((p) => p.progress < 1).length,
    counts: window.__game.summary().counts, food: window.__game.summary().food, water: window.__game.summary().water, power: window.__game.summary().power,
    issues: window.__game.issues(),
  };
});
console.log('after cheat', JSON.stringify({ ...s, issues: Object.keys(s.issues).length }));
check('the woods plot is now owned', s.plot === 'woods');
check('land was bought (east, north and south)', s.expansion.e >= 2 && s.expansion.n >= 1 && s.expansion.s >= 1 && s.expansion.w === 0, JSON.stringify(s.expansion));
check('everything is finished', s.unfinished === 0 && s.pieces > 120, `(${s.pieces} pieces)`);
check('you are at the base', s.at === 'base');
check('money is still positive', s.money > 0, `($${s.money})`);
check('two cabins and sleeping places for everyone', s.counts.shelters >= 2);
check('all farms work', s.counts.farms >= 4 && s.counts.workingFarms === s.counts.farms, JSON.stringify(s.counts));
check('no structure reports a problem', Object.keys(s.issues).length === 0, JSON.stringify(s.issues));
check('the outer wall is made of many barrier pieces', s.counts.barriers > 100, `(${s.counts.barriers})`);

// Let two weeks go by: the family must live comfortably and the base must feed them
await G(() => { window.__game.advanceHours(24 * 14); window.__game.refreshSurvival(); });
const later = await G(() => {
  const st = window.__game.state;
  const sum = window.__game.summary();
  return { phase: st.phase, hp: st.player.health, hunger: st.player.hunger, thirst: st.player.thirst, food: sum.food, water: sum.water, power: sum.power, issues: Object.keys(window.__game.issues()).length, fresh: st.storage.fresh_food ?? 0 };
});
console.log('after 14 days', JSON.stringify(later));
check('the family is alive and healthy after 14 days', later.phase === 'prep' && later.hp >= 95 && later.hunger >= 60 && later.thirst >= 60, `(health ${later.hp}, hunger ${later.hunger}, thirst ${later.thirst})`);
check('food and water are self-sufficient', later.food.sustained && later.water.sustained);
check('still no problems', later.issues === 0);

// Pictures
await page.keyboard.press('Escape');
await G(() => { const g = window.__game; g.turnView(45 - g.viewDegrees()); g.tiltView(52 - g.tiltDegrees()); g.settleCamera(); });
await page.keyboard.press('KeyV');
await page.waitForTimeout(2500);
await page.screenshot({ path: out + 'woods-default.png' });
await G(() => { const g = window.__game; g.turnView(180); g.settleCamera(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'woods-180.png' });
await G(() => { const g = window.__game; g.turnView(-180 + 20); g.tiltView(88 - g.tiltDegrees()); g.settleCamera(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: out + 'woods-top.png' });

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
