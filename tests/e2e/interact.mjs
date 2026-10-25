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
const piece = (id) => G((id) => window.__game.state.pieces.find((p) => p.id === id) ?? null, id);
const find = (type) => G((type) => window.__game.state.pieces.find((p) => p.type === type)?.id ?? null, type);
const centerOf = (id) => G(async (id) => {
  const b = await import('/src/sim/build.ts');
  const st = window.__game.state;
  const p = st.pieces.find((q) => q.id === id);
  return b.pieceCenter(b.gridOf(st), p.type, p.cx, p.cz, p.rot);
}, id);
const clickWorld = async (x, z, h = 0.6) => {
  const p = await G(([x, z, h]) => window.__game.project(x, z, h), [x, z, h]);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
};
const clickPiece = async (id, h = 0.8) => { const c = await centerOf(id); await clickWorld(c.x, c.z, h); };
const cellWorld = (cx, cz) => G(async ([cx, cz]) => { const b = await import('/src/sim/build.ts'); const g = b.gridOf(window.__game.state); return { x: g.originX + (cx + 0.5) * 2, z: g.originZ + (cz + 0.5) * 2 }; }, [cx, cz]);

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.survivalOff(true); g.ownPlot('farm'); g.state.at = 'base';
  g.placeDone('fence_wood', 2, 2, 0);
  g.placeDone('cabin_small', 6, 6);
  g.placeDone('well_hand', 12, 3);
  g.placeDone('water_tank', 13, 3);
  g.placeDone('solar_panel', 4, 10);
  g.placeDone('battery_bank', 5, 10);
  g.placeDone('pond_small', 12, 8);
  g.placeDone('wall_concrete', 8, 2, 0);
  g.give('workbench', 3);
  g.snapCamera(-55, 64); g.settleCamera();
});
await page.waitForTimeout(600);

// ---- No separate building mode
check('there is no build bar any more', (await page.locator('.build-bar').count()) === 0);
await page.keyboard.press('KeyI');
await page.waitForTimeout(500);
check('the storage list shows what can be placed', await page.locator('.drawer').isVisible() && /workbench/i.test(await page.locator('.drawer').innerText()));
await page.locator('.drawer .mini-btn', { hasText: 'Place' }).first().click();
await page.waitForTimeout(600);
check('Place starts placing, with a small bar', await page.locator('.placing-bar').isVisible());
check('the dock stays on screen while placing', await page.locator('.dock').isVisible());
check('the storage list closes so the land is clear', !(await page.locator('.drawer').isVisible()));
await page.locator('.placing-bar .tool-btn', { hasText: 'Storage' }).click();
await page.waitForTimeout(400);
check('the placing bar can reopen it', await page.locator('.drawer').isVisible());
await page.keyboard.press('KeyI');
await page.waitForTimeout(300);
const before = await G(() => ({ n: window.__game.state.pieces.length, shelf: window.__game.state.storage.workbench }));
const spot = await cellWorld(9, 12);
await clickWorld(spot.x, spot.z, 0.3);
const after1 = await G(() => ({ n: window.__game.state.pieces.length, shelf: window.__game.state.storage.workbench }));
check('clicking the land places it', after1.n === before.n + 1 && after1.shelf === before.shelf - 1, JSON.stringify([before, after1]));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape stops placing', !(await page.locator('.placing-bar').isVisible()));

// ---- Every placed structure can be clicked
await G(async () => { const b = await import('/src/sim/build.ts'); b.finishAllConstruction(window.__game.state); window.__game.advanceHours(0.01); });
const bench = await find('workbench');
await clickPiece(bench);
check('clicking a structure opens its card', await page.locator('.piece-panel').isVisible() && /workbench/i.test(await page.locator('.piece-panel').innerText()));
const text0 = await page.locator('.piece-panel').innerText();
check('the card shows strength', /strength/i.test(text0) && /100%/.test(text0), text0.replace(/\n/g, ' | ').slice(0, 160));

// ---- Instant rotate and move
const cabin = await find('cabin_small');
const rotBefore = (await piece(cabin)).rot;
const clock0 = await G(() => window.__game.state.worldSeconds);
await clickPiece(cabin, 1.5);
check('the card of a cabin opens', /log cabin/i.test(await page.locator('.piece-panel').innerText()));
await page.keyboard.press('KeyR');
await page.waitForTimeout(400);
const rotAfter = (await piece(cabin)).rot;
check('R turns the selected structure at once', rotAfter === (rotBefore + 1) % 4, `(${rotBefore} -> ${rotAfter})`);
const clock1 = await G(() => window.__game.state.worldSeconds);
check('turning takes no game time worth mentioning', clock1 - clock0 < 120, `(${Math.round(clock1 - clock0)} s)`);
await page.locator('.piece-panel .btn', { hasText: 'Rotate' }).click();
await page.waitForTimeout(300);
check('the Rotate button works too', (await piece(cabin)).rot === (rotBefore + 2) % 4);

const hpBefore = (await piece(cabin)).hp;
await page.locator('.piece-panel .btn', { hasText: 'Move' }).click();
await page.waitForTimeout(500);
check('Move lifts it and shows the placing bar', await page.locator('.placing-bar').isVisible() && /moving/i.test(await page.locator('.placing-bar').innerText()));
const old = await piece(cabin);
const target = await cellWorld(16, 12);
await clickWorld(target.x + 1, target.z + 1, 0.3);
const moved = await piece(cabin);
check('clicking the land moves it at once', moved.cx !== old.cx || moved.cz !== old.cz, `(${old.cx},${old.cz} -> ${moved.cx},${moved.cz})`);
check('it is still the same cabin and keeps its strength', moved.id === cabin && Math.abs(moved.hp - hpBefore) < 2);
check('placing stopped and the card is back', !(await page.locator('.placing-bar').isVisible()) && await page.locator('.piece-panel').isVisible());

// ---- Wear over time
await G(() => window.__game.advanceHours(24 * 30));
const fence = await find('fence_wood');
const wall = await find('wall_concrete');
const f = await piece(fence), w = await piece(wall);
const fenceLoss = 1 - f.hp / f.maxHp, wallLoss = 1 - w.hp / w.maxHp;
console.log(`after 30 days: wooden fence lost ${(fenceLoss * 100).toFixed(1)}%, concrete wall lost ${(wallLoss * 100).toFixed(1)}%`);
check('a wooden fence wears about a quarter in a month', fenceLoss > 0.2 && fenceLoss < 0.28, `(${(fenceLoss * 100).toFixed(1)}%)`);
check('a concrete wall wears much more slowly', wallLoss > 0.02 && wallLoss < 0.06 && wallLoss < fenceLoss / 4, `(${(wallLoss * 100).toFixed(1)}%)`);

// ---- Repair
await clickPiece(fence, 0.8);
const card = await page.locator('.piece-panel').innerText();
check('the card shows the wear', /7\d%|6\d%/.test(card), card.replace(/\n/g, ' | ').slice(0, 200));
check('Repair is offered with its cost', /repair/i.test(card) && /lumber/i.test(card));
const repairBtn = page.locator('.piece-panel .piece-job', { hasText: 'Repair' }).locator('button');
check('Repair is disabled without a toolbox and materials', await repairBtn.isDisabled());
await G(() => { const g = window.__game; g.give('toolbox', 1); g.give('lumber', 5); g.give('nails', 5); });
await page.waitForTimeout(2200);
check('Repair turns on once you have them', await repairBtn.isEnabled());
const lum0 = await G(() => window.__game.state.storage.lumber);
await repairBtn.click();
await page.waitForTimeout(500);
const f2 = await piece(fence);
const lum1 = await G(() => window.__game.state.storage.lumber ?? 0);
check('repair restores full strength', f2.hp >= f2.maxHp - 1.5, '(' + f2.hp.toFixed(1) + ' of ' + f2.maxHp + ')');
check('repair uses up materials but not the toolbox', lum1 < lum0 && (await G(() => window.__game.state.storage.toolbox)) === 1, `(lumber ${lum0} -> ${lum1})`);

// ---- Upgrade
const upBtn = page.locator('.piece-panel .piece-job', { hasText: 'Upgrade' }).locator('button');
check('Upgrade needs a power tool set', await upBtn.isDisabled());
await G(() => { const g = window.__game; g.give('power_tools', 1); g.give('lumber', 40); g.give('nails', 40); });
await page.waitForTimeout(2200);
check('Upgrade turns on', await upBtn.isEnabled());
await upBtn.click();
await page.waitForTimeout(500);
const f3 = await piece(fence);
check('upgrade raises the level and strength', (f3.upgrade ?? 0) === 1 && f3.maxHp > f2.maxHp && f3.hp >= f3.maxHp - 1.5, `(level ${f3.upgrade}, ${f2.maxHp} -> ${f3.maxHp} hp)`);

// ---- A pond silts up and can be cleaned
const pond = await find('pond_small');
const pondDirt = (await piece(pond)).dirt ?? 0;
console.log('pond dirt after a month:', pondDirt.toFixed(2));
check('the pond is dirty after a month', pondDirt > 0.9);
await clickPiece(pond, 0.3);
const pcard = await page.locator('.piece-panel').innerText();
check('the card says the pond is dirty and offers a cleaning', /dirt/i.test(pcard) && /clean/i.test(pcard), pcard.replace(/\n/g, ' | ').slice(0, 220));
const cleanBtn = page.locator('.piece-panel .piece-job', { hasText: 'Clean' }).locator('button');
check('Clean needs a shovel', await cleanBtn.isDisabled());
await G(() => window.__game.give('shovel', 1));
await page.waitForTimeout(2200);
await cleanBtn.click();
await page.waitForTimeout(500);
check('cleaning makes it clean again', ((await piece(pond)).dirt ?? 0) < 0.03);

// ---- Worn machines make less
const sumBefore = await G(() => { window.__game.refreshSurvival(); return window.__game.summary().water.makePerDay; });
await G(() => { const st = window.__game.state; for (const p of st.pieces) if (p.type === 'well_hand') p.hp = p.maxHp * 0.1; window.__game.refreshSurvival(); });
const sumAfter = await G(() => window.__game.summary().water.makePerDay);
check('a nearly broken well makes less water', sumAfter < sumBefore * 0.6, `(${sumBefore.toFixed(0)} -> ${sumAfter.toFixed(0)} L a day)`);
const wellId = await find('well_hand');
const probs = await G(() => window.__game.summary().problems.map((p) => p.issue.code));
check('and it gets a repair warning', probs.includes('worn'), JSON.stringify(probs));

// ---- Take down a worn thing: scrap, not a free repair
await G((id) => { const st = window.__game.state; const p = st.pieces.find((q) => q.id === id); p.hp = p.maxHp * 0.3; }, wall);
const wallsInStorage0 = await G(() => window.__game.state.storage.wall_concrete ?? 0);
await clickPiece(wall, 0.8);
await page.locator('.piece-panel .btn', { hasText: 'Take down' }).click();
await page.waitForTimeout(600);
const wallsInStorage1 = await G(() => window.__game.state.storage.wall_concrete ?? 0);
const gone = (await piece(wall)) === null;
check('taking down a worn wall removes it', gone);
check('a worn wall gives back scrap, not the wall', wallsInStorage1 === wallsInStorage0, `(${wallsInStorage0} -> ${wallsInStorage1})`);
check('the card closes', !(await page.locator('.piece-panel').isVisible()));

// ---- Cables and pipes: hidden until wanted
await G(() => window.__game.refreshSurvival());
const stats0 = await G(() => window.__game.scenery().pieces);
check('cables and pipes are hidden by default', stats0.links > 0 && stats0.linksShown === 0, JSON.stringify(stats0));
const solar = await find('solar_panel');
await clickPiece(solar, 0.5);
const stats1 = await G(() => window.__game.scenery().pieces);
check('selecting a connected structure shows its own network', stats1.linksShown > 0, JSON.stringify(stats1));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const stats2 = await G(() => window.__game.scenery().pieces);
check('they go away again when it is deselected', stats2.linksShown === 0);
await page.keyboard.press('KeyU');
await page.waitForTimeout(400);
const stats3 = await G(() => window.__game.scenery().pieces);
check('U shows every cable and pipe', stats3.linksShown > 0 && (await page.locator('.view-btn.active').count()) === 1, JSON.stringify(stats3));
await page.screenshot({ path: out + 'interact-lines.png' });
await page.keyboard.press('KeyU');
await page.waitForTimeout(300);
check('U hides them again', (await G(() => window.__game.scenery().pieces)).linksShown === 0);

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
