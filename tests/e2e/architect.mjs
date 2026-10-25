import { chromium } from 'playwright-core';
const out = (process.env.SHOTS_DIR || process.env.TEMP || '.') + '/';
const PORT = process.env.PORT;
const PLOT = process.env.PLOT || 'farm';
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
await page.waitForTimeout(1500);

// The base the player already has: a plot, a few fence sections, a well and a garden bed
await G((id) => { window.__game.setRain(0); window.__game.ownPlot(id); window.__game.state.at = 'base'; window.__game.give('bottled_water', 30); window.__game.give('canned_food', 30); }, PLOT);
const existing = await G(() => {
  const g = window.__game;
  const r = [];
  r.push(g.placeDone('well_hand', 2, 2));
  r.push(g.placeDone('garden_bed', 5, 2));
  r.push(g.placeDone('cabin_small', 8, 6));
  for (let i = 0; i < 6; i++) r.push(g.placeDone('fence_wood', 6 + i, 0, 0));
  return r;
});
console.log('existing placement results', JSON.stringify(existing));

const t0 = Date.now();
const planInfo = await G(async () => {
  const a = await import('/src/sim/architect.ts');
  const st = window.__game.state;
  const t = performance.now();
  const plan = a.planBase(st);
  const ms = performance.now() - t;
  const findings = a.analyseBase(st);
  window.__plan = plan;
  return {
    ms,
    findings: findings.map((f) => `${f.status} ${f.title}`),
    pieces: plan.pieces.length,
    byType: plan.lines.map((l) => `${l.type} x${l.qty} (buy ${l.buy}) $${l.total}`),
    cost: plan.cost, shortfall: plan.shortfall, notes: plan.notes, crew: plan.crewHours, gate: plan.gateSide,
    outcome: plan.outcome, money: st.money,
  };
});
console.log('plan computed in', Math.round(planInfo.ms), 'ms (wall', Date.now() - t0, 'ms)');
console.log('findings', JSON.stringify(planInfo.findings, null, 1));
console.log('lines', JSON.stringify(planInfo.byType, null, 1));
console.log('cost', planInfo.cost, 'money', planInfo.money, 'shortfall', planInfo.shortfall, 'crew hours', planInfo.crew.toFixed(1), 'gate', planInfo.gate);
console.log('notes', JSON.stringify(planInfo.notes));
console.log('outcome', JSON.stringify(planInfo.outcome));

check('plan has pieces', planInfo.pieces > 40, `(${planInfo.pieces})`);
check('plan computes quickly', planInfo.ms < 4000, `(${Math.round(planInfo.ms)} ms)`);
check('plan adds exactly two cabins', planInfo.byType.some((l) => l.startsWith('cabin_small x2')));
check('plan has orchards, a greenhouse and a fish pond or other food', planInfo.byType.some((l) => l.startsWith('orchard_plot')));
check('design feeds the target group', planInfo.outcome.mealsMake >= planInfo.outcome.mealsNeed, `(${planInfo.outcome.mealsMake.toFixed(1)} of ${planInfo.outcome.mealsNeed})`);
check('design waters the target group', planInfo.outcome.waterMake >= planInfo.outcome.waterNeed, `(${planInfo.outcome.waterMake.toFixed(0)} of ${planInfo.outcome.waterNeed})`);
check('design has no power or link problems', planInfo.outcome.problems.length === 0, JSON.stringify(planInfo.outcome.problems));

// Funds
const funds = await G(async () => {
  const e = await import('/src/sim/economy.ts');
  const st = window.__game.state;
  const before = st.money;
  e.grantFunds(st);
  return { before, after: st.money };
});
check('sandbox funds add $500,000', funds.after - funds.before === 500000, JSON.stringify(funds));

// Build it
const built = await G(async () => {
  const a = await import('/src/sim/architect.ts');
  const st = window.__game.state;
  const plan = a.planBase(st);
  const before = { money: st.money, pieces: st.pieces.length };
  const res = a.buildPlan(st, plan);
  window.__game.advanceHours(0.01);
  return { res, before, afterPieces: st.pieces.length, money: st.money, expected: plan.pieces.length, cost: plan.cost };
});
console.log('built', JSON.stringify(built));
check('build succeeded', built.res.ok === true);
check('every planned piece was placed', built.res.ok && built.res.failed === 0 && built.res.placed === built.expected, JSON.stringify(built.res));
check('money went down by the plan cost', built.res.ok && built.res.spent === built.cost, `(spent ${built.res.spent}, plan ${built.cost})`);

// Let the crew finish: advance in pieces so deliveries and construction run
await G(() => { window.__game.advanceHours(24 * 6); });
const unfinished = await G(() => window.__game.state.pieces.filter((p) => p.progress < 1).length);
check('crew finishes everything within 6 days', unfinished === 0, `(${unfinished} left)`);

// Re-run the analysis on the finished base
const after = await G(async () => {
  const a = await import('/src/sim/architect.ts');
  const st = window.__game.state;
  window.__game.refreshSurvival();
  const f = a.analyseBase(st);
  const next = a.planBase(st);
  return { findings: f.map((x) => `${x.status} ${x.title}`), summary: window.__game.summary(), issues: window.__game.issues(), nextPieces: next ? next.pieces.length : null, nextNotes: next?.notes, nextCost: next?.cost };
});
console.log('after findings', JSON.stringify(after.findings, null, 1));
console.log('after summary counts', JSON.stringify(after.summary.counts), 'food', JSON.stringify(after.summary.food), 'water', JSON.stringify(after.summary.water), 'power', JSON.stringify(after.summary.power));
console.log('issues', JSON.stringify(after.issues));
const prevCabins = existing[2] === null ? 1 : 0;
check('two more cabins than before', after.summary.counts.shelters >= prevCabins + 2, `(${after.summary.counts.shelters})`);
check('farms are all working', after.summary.counts.workingFarms === after.summary.counts.farms, JSON.stringify(after.summary.counts));
check('food is sustained for the target group', after.summary.food.makePerDay >= 24, `(${after.summary.food.makePerDay.toFixed(1)}/day)`);
check('water is sustained', after.summary.water.sustained === true);
check('no structure reports a problem', Object.keys(after.issues).length === 0, JSON.stringify(after.issues));
check('outer wall is closed', after.findings.some((f) => f.startsWith('good Outer wall')), after.findings.find((f) => f.includes('Outer wall')));
check('planning again after building adds little', (after.nextPieces ?? 0) < 12, `(${after.nextPieces} pieces, $${after.nextCost})`);

// Look at it
await G(() => { window.__game.state.at = 'base'; });
await page.keyboard.press('KeyV');
await page.waitForTimeout(2500);
await page.screenshot({ path: out + `arch-${PLOT}.png` });

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
