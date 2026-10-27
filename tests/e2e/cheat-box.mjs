import { chromium } from 'playwright-core';
import { newGame } from './helpers.mjs';
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
await newGame(page);
await page.waitForTimeout(1500);
await G(() => {
  const g = window.__game;
  g.setRain(0); g.survivalOff(true); g.ownPlot('farm'); g.state.at = 'base';
});
// A big pile of unfinished work: the architect's whole plan
const queued = await G(async () => {
  const a = await import('/src/sim/architect.ts');
  const e = await import('/src/sim/economy.ts');
  const st = window.__game.state;
  e.grantFunds(st);
  const res = a.buildPlan(st, a.planBase(st));
  return { ok: res.ok, unfinished: st.pieces.filter((p) => p.progress < 1).length, total: st.pieces.length };
});
check('there is a lot of unfinished building', queued.ok && queued.unfinished > 100, JSON.stringify(queued));

// Open the box with the backquote key
await page.keyboard.press('Backquote');
await page.waitForTimeout(400);
check('the backquote key opens the cheat box', await page.locator('.cheat-console').isVisible());
check('the box has the cursor', await page.evaluate(() => document.activeElement?.closest('.cheat-console') !== null));

// Typing letters must not trigger game keys (B would open the store, I the storage drawer)
await page.keyboard.type('bi');
await page.waitForTimeout(300);
const shopOpen = await page.locator('.modal').count();
check('typing in the box does not trigger game keys', shopOpen === 0 && (await page.locator('.cheat-console input').inputValue()) === 'bi');
await page.locator('.cheat-console input').fill('');

await page.keyboard.type('hello');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('an unknown code is explained', /Unknown code/.test(await page.locator('.cheat-result').innerText()), await page.locator('.cheat-result').innerText());

const before = await G(() => window.__game.state.pieces.filter((p) => p.progress < 1).length);
await page.keyboard.type('BuildNow');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const after = await G(() => ({ left: window.__game.state.pieces.filter((p) => p.progress < 1).length, total: window.__game.state.pieces.length }));
check('buildnow finishes every piece at once', before > 100 && after.left === 0, `(${before} unfinished -> ${after.left} of ${after.total})`);
check('the box says how many', /finished/.test(await page.locator('.cheat-result').innerText()), await page.locator('.cheat-result').innerText());

// Saved too
await page.waitForTimeout(2500);
const saved = await G(async () => {
  await window.__game.save();
  return window.__game.state.pieces.every((p) => p.progress >= 1);
});
check('the finished state is kept', saved === true);

// Nothing left to build
await page.keyboard.type('buildnow');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('a second buildnow says nothing is being built', /Nothing is being built/.test(await page.locator('.cheat-result').innerText()));

// Money
const m0 = await G(() => window.__game.state.money);
await page.keyboard.type('money');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const m1 = await G(() => window.__game.state.money);
check('money adds $500,000', m1 - m0 === 500000, `(${m0} -> ${m1})`);

// The base now works: survival sees finished farms
await G(() => window.__game.refreshSurvival());
const counts = await G(() => window.__game.summary().counts);
check('the finished base counts its farms and cabins', counts.farms >= 3 && counts.shelters >= 2, JSON.stringify(counts));

// Close with Escape, then game keys work again
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the box', !(await page.locator('.cheat-console').isVisible()));
await page.keyboard.press('KeyI');
await page.waitForTimeout(500);
check('game keys work again afterwards (I opens storage)', await page.locator('.drawer').isVisible());

console.log(errors.length ? 'console errors: ' + errors.slice(0, 6).join(' | ') : 'no console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
