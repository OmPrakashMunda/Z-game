import { chromium } from 'playwright-core';
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
const cheat = async (code) => {
  if (!(await page.locator('.cheat-console').isVisible())) { await page.keyboard.press('Backquote'); await page.waitForTimeout(300); }
  const box = page.locator('.cheat-console input');
  await box.fill(code);
  await box.press('Enter');
  await page.waitForTimeout(350);
  return page.locator('.cheat-result').innerText();
};
const solar = () => G(() => { window.__game.refreshSurvival(); return window.__game.summary().power.makeKw; });
const tag = async () => (await page.locator('.cheat-tag').isVisible()) ? await page.locator('.cheat-tag').getAttribute('title') : '';
const piece = (type) => G((t) => window.__game.state.pieces.find((p) => p.type === t) ?? null, type);

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.survivalOff(true); g.ownPlot('farm'); g.state.at = 'base';
  g.placeDone('solar_array', 4, 10);
  g.placeDone('battery_bank', 7, 10);
  g.placeDone('fence_wood', 2, 2, 0);
  g.placeDone('water_tank', 12, 3);
  g.skipToDay(2, 23); // middle of the night
});
await page.waitForTimeout(500);

// ---- Help
let r = await cheat('help');
check('HELP lists the cheats', /NONIGHT/.test(r) && /RAINALLDAY/.test(r) && /NOBUILDTIME/.test(r) && /NOCARS/.test(r), r.slice(0, 120));
r = await cheat('banana');
check('an unknown code is explained', /Unknown code/.test(r), r);
check('no tag while nothing is on', (await tag()) === '');

// ---- Day and night
check('solar panels make nothing at night', (await solar()) < 0.01);
r = await cheat('nonight');
check('NONIGHT says it is on', /NONIGHT on/.test(r), r);
check('NONIGHT makes it daytime for the rules too (solar works)', (await solar()) > 1, `(${(await solar()).toFixed(2)} kW)`);
check('the tag shows the cheat', /NONIGHT/.test(await tag()), await tag());
r = await cheat('noday');
check('NODAY replaces NONIGHT', /NODAY on/.test(r) && (await solar()) < 0.01 && !/NONIGHT/.test(await tag()), await tag());
await G(() => window.__game.skipToDay(3, 12));
check('NODAY holds even at noon', (await solar()) < 0.01);
r = await cheat('noday');
check('typing it again turns it off', /NODAY off/.test(r) && (await solar()) > 1);

// ---- Weather
await G(() => window.__game.advanceScenery(60, window.__game.state.worldSeconds));
r = await cheat('rainallday');
await G(() => window.__game.advanceScenery(40, window.__game.state.worldSeconds));
check('RAINALLDAY makes it rain', (await G(() => window.__game.scenery().rain)) > 0.5, r);
r = await cheat('norain');
await G(() => window.__game.advanceScenery(60, window.__game.state.worldSeconds));
check('NORAIN stops it', (await G(() => window.__game.scenery().rain)) < 0.05, r);
await G(() => window.__game.advanceScenery(600, window.__game.state.worldSeconds));
check('and it stays dry for a long time', (await G(() => window.__game.scenery().rain)) < 0.05);
await cheat('normalweather');

// ---- Cars
const cars0 = await G(() => window.__game.scenery());
check('there are cars on the road to start with', cars0.cars > 3 && cars0.visibleCars === cars0.cars, `(${cars0.cars})`);
r = await cheat('nocars');
await G(() => window.__game.advanceScenery(20, window.__game.state.worldSeconds));
const cars1 = await G(() => window.__game.scenery());
check('NOCARS hides every car, including new ones', cars1.visibleCars === 0 && cars1.cars > 0, JSON.stringify([cars1.cars, cars1.visibleCars]));
await cheat('nocars');
check('NOCARS off brings them back', (await G(() => window.__game.scenery().visibleCars)) > 0);

// ---- Building
await G(() => window.__game.give('cabin_small', 1));
const placed = async () => G(async () => {
  const b = await import('/src/sim/build.ts');
  const st = window.__game.state;
  st.storage.cabin_small = 1;
  const r = b.placePiece(st, 'cabin_small', 10, 10, 0);
  return { ok: r.ok, progress: r.ok ? r.piece.progress : null, reason: r.ok ? '' : r.reason };
});
let pl = await placed();
check('normally a new cabin starts at 0%', pl.ok && pl.progress === 0, JSON.stringify(pl));
await G(async () => { const b = await import('/src/sim/build.ts'); const st = window.__game.state; const p = st.pieces.filter((q) => q.type === 'cabin_small').pop(); b.removePiece(st, p.id); });
r = await cheat('nobuildtime');
pl = await placed();
check('NOBUILDTIME finishes it the moment it is placed', pl.ok && pl.progress === 1, JSON.stringify(pl));
await cheat('nobuildtime');

// ---- Wear
await cheat('nowear');
const hp0 = (await piece('fence_wood')).hp;
await G(() => window.__game.advanceHours(24 * 20));
const hp1 = (await piece('fence_wood')).hp;
check('NOWEAR: nothing wears out in 20 days', hp1 === hp0, `(${hp0} -> ${hp1})`);
await cheat('nowear');
await G(() => window.__game.advanceHours(24 * 5));
check('with it off, wear is back', (await piece('fence_wood')).hp < hp0 - 1);

// ---- Free repairs
r = await cheat('freerepairs');
const fixed = await G(async () => {
  const u = await import('/src/sim/upkeep.ts');
  const st = window.__game.state;
  const f = st.pieces.find((p) => p.type === 'fence_wood');
  f.hp = f.maxHp * 0.3;
  delete st.storage.toolbox; delete st.storage.lumber; delete st.storage.nails;
  const a = u.repairPiece(st, f.id);
  const b = u.upgradePiece(st, f.id);
  return { a, b, hp: f.hp, max: f.maxHp, level: f.upgrade ?? 0 };
});
check('FREEREPAIRS: repair and upgrade need no tools or materials', fixed.a.ok && fixed.b.ok && fixed.level === 1, JSON.stringify(fixed));
await cheat('freerepairs');

// ---- God mode
await cheat('godmode');
await G(() => { const st = window.__game.state; window.__game.survivalOff(false); st.player.thirst = 5; st.player.hunger = 5; st.player.health = 40; });
await G(() => window.__game.advanceHours(24));
const pl2 = await G(() => ({ ...window.__game.state.player, phase: window.__game.state.phase }));
check('GODMODE keeps the family fed, watered and healthy', pl2.thirst === 100 && pl2.hunger === 100 && pl2.health === 100 && pl2.phase === 'prep', JSON.stringify(pl2));
await cheat('godmode');
await G(() => window.__game.survivalOff(true));

// ---- Free shop
await G(() => window.__game.setMoney(5000));
const shop0 = await G(async () => { const e = await import('/src/sim/economy.ts'); const st = window.__game.state; const before = st.money; const r = e.placeOrder(st, 'online', { wall_concrete: 3 }); return { before, ok: r.ok, reason: r.ok ? '' : r.reason, after: st.money }; });
check('normally 3 concrete walls are too dear for $5,000', !shop0.ok, JSON.stringify(shop0));
await cheat('freeshop');
const shop1 = await G(async () => { const e = await import('/src/sim/economy.ts'); const st = window.__game.state; const before = st.money; const r = e.placeOrder(st, 'online', { wall_concrete: 3 }); return { before, ok: r.ok, after: st.money, have: st.storage.wall_concrete }; });
check('FREESHOP: they cost nothing', shop1.ok && shop1.after === shop1.before && shop1.have === 3, JSON.stringify(shop1));
await cheat('freeshop');

// ---- Freeze time
await cheat('freezetime');
const t0 = await G(() => window.__game.state.worldSeconds);
await page.waitForTimeout(2500);
const t1 = await G(() => window.__game.state.worldSeconds);
check('FREEZETIME: the clock does not move', t1 === t0, `(${t0} -> ${t1})`);
await cheat('freezetime');
await page.waitForTimeout(2500);
check('and it runs again when turned off', (await G(() => window.__game.state.worldSeconds)) > t1);

// ---- One-offs
r = await cheat('setmoney 1234');
check('SETMONEY sets your money', (await G(() => window.__game.state.money)) === 1234, r);
r = await cheat('setmoney abc');
check('SETMONEY explains itself', /Use it like/.test(r), r);
await G(() => window.__game.skipToDay(2, 8));
r = await cheat('skipday');
check('SKIPDAY moves to 08:00 the next day', /08:00/.test(r), r);
r = await cheat('setday 9');
check('SETDAY jumps forward', /day 9/.test(r), r);
r = await cheat('setday 2');
check('SETDAY will not go back', /only goes forward/.test(r), r);
r = await cheat('givetools');
const stor = await G(() => window.__game.state.storage);
check('GIVETOOLS gives the four tools and materials', stor.toolbox >= 1 && stor.shovel >= 1 && stor.power_tools >= 1 && stor.welding_kit >= 1 && stor.lumber >= 20, r);
r = await cheat('stockup');
check('STOCKUP gives food and water', (await G(() => window.__game.state.storage.canned_food)) >= 30, r);
await G(() => { for (const p of window.__game.state.pieces) { if (p.type === 'fence_wood') p.hp = p.maxHp * 0.2; } });
r = await cheat('fixall');
const fw = await piece('fence_wood');
check('FIXALL repairs everything', fw.hp >= fw.maxHp - 2, r);
r = await cheat('maxupgrade');
check('MAXUPGRADE makes level 3', (await piece('fence_wood')).upgrade === 3, r);
r = await cheat('fulltanks');
check('FULLTANKS fills tanks and batteries', (await piece('water_tank')).level === 1000 && (await piece('battery_bank')).level === 12, r);

// ---- Several at once, then switch them all off
await cheat('nonight');
await cheat('norain');
await cheat('nocars');
await cheat('godmode');
check('several cheats show together in the tag', (await tag()).split(',').length === 4, await tag());
r = await cheat('resetcheats');
check('RESETCHEATS turns every switch off', (await tag()) === '' && (await solar()) >= 0, r);

// ---- Cheats end with the session
await cheat('nonight');
await cheat('nocars');
await cheat('freeshop');
await page.keyboard.press('Escape'); // closes the box
await page.keyboard.press('Escape'); // opens the menu
await page.waitForTimeout(500);
await page.getByText('Save & exit to title').click();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(2500);
check('leaving the game and coming back switches the cheats off', (await tag()) === '', await tag());
const shop2 = await G(async () => { const e = await import('/src/sim/economy.ts'); const st = window.__game.state; st.money = 100; return e.quote(st, 'online', { wall_concrete: 1 }).total; });
check('prices are real again after coming back', shop2 > 100, `(${shop2})`);
check('the cars are back', (await G(() => window.__game.scenery().visibleCars)) > 0);

// ---- A reload ends them too
await cheat('nobuildtime');
await cheat('freeshop');
await page.waitForTimeout(2200);
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('Continue').click();
await page.waitForTimeout(2000);
check('reloading the page switches the cheats off', (await tag()) === '');
const shop3 = await G(async () => { const e = await import('/src/sim/economy.ts'); const st = window.__game.state; return e.quote(st, 'online', { wall_concrete: 1 }).total; });
check('and nothing was saved with the save', shop3 > 0, `(${shop3})`);

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
