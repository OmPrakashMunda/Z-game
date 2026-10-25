import { chromium } from 'playwright-core';
const PORT = process.env.PORT;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[error] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const check = (label, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${extra}`);
const G = (fn, arg) => page.evaluate(fn, arg);
const ws = () => G(() => window.__game.state.worldSeconds);
const info = () => G(() => window.__game.speedInfo());
const money = () => G(() => window.__game.state.money);

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
await page.waitForTimeout(1500);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); window.__game.ownPlot('warehouse'); window.__game.state.at = 'base'; });

// ============================================================ Speed
check('three speed buttons are in the top bar', (await page.locator('.speed-btn').count()) === 3);
check('the game starts at normal speed', (await info()).chosen === 1 && (await page.locator('.speed-btn.active').getAttribute('data-speed')) === '1');

async function rate(ms) {
  const a = await ws();
  const t0 = Date.now();
  await page.waitForTimeout(ms);
  return ((await ws()) - a) / ((Date.now() - t0) / 1000);
}
const normal = await rate(4000);
await page.locator('.speed-btn[data-speed="12"]').click();
await page.waitForTimeout(300);
check('clicking 12x selects it', (await info()).chosen === 12 && (await page.locator('.speed-btn.active').getAttribute('data-speed')) === '12');
const fast = await rate(4000);
check('the clock really runs about 12 times faster', fast / normal > 6 && fast / normal < 30, `(normal ${normal.toFixed(0)} game s per s, fast ${fast.toFixed(0)}, x${(fast / normal).toFixed(1)})`);
await page.locator('.speed-btn[data-speed="1"]').click();
await page.waitForTimeout(300);
const back = await rate(3000);
check('clicking 1x goes back to normal', (await info()).chosen === 1 && back / normal < 1.8, `(x${(back / normal).toFixed(1)} of normal)`);

await page.keyboard.press('KeyF');
check('F fast-forwards', (await info()).chosen === 4);
await page.keyboard.press('KeyF');
check('F again goes back to normal', (await info()).chosen === 1);

// Fast-forward waits while you shop and resumes after
await G(() => window.__game.setSpeed(12));
await page.keyboard.press('KeyB');
await page.waitForSelector('.modal.shop', { timeout: 15000 });
let i = await info();
check('while the shop is open the clock is held at normal', i.chosen === 12 && i.effective === 1, JSON.stringify(i));
await page.waitForTimeout(600);
check('the speed control says it is paused', await page.locator('.speed-group.held').count() === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
i = await info();
check('closing the shop resumes the fast speed', i.chosen === 12 && i.effective === 12, JSON.stringify(i));

// Something needs attention: back to normal
await G(() => { window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.toast')) if (!window.__toasts.includes(t.textContent)) window.__toasts.push(t.textContent); }).observe(document.getElementById('ui'), { childList: true, subtree: true, characterData: true }); });
await G(() => { window.__game.survivalOff(false); window.__game.state.player.thirst = 30; });
await page.waitForTimeout(1500);
check('a thirsty family drops the speed back to normal', (await info()).chosen === 1);
const seen = await G(() => window.__toasts);
check('and says why', seen.some((t) => /normal speed.*thirsty|food|water|drink/i.test(t)), JSON.stringify(seen));
await G(() => { window.__game.state.player.thirst = 100; window.__game.survivalOff(true); window.__game.setSpeed(4); });
await page.waitForTimeout(300);
await G(async () => { const m = await import('/src/sim/messages.ts'); m.addMessage(window.__game.state, 'Test warning', 'warning'); });
await page.waitForTimeout(1500);
check('any warning message drops the speed back to normal', (await info()).chosen === 1);
await G(() => window.__game.setSpeed(12));
await G(() => window.__game.skipToDay(30, 12));
await page.waitForTimeout(1500);
check('the outbreak drops the speed back to normal', (await info()).chosen === 1);

// ============================================================ Returns
await G(() => window.__game.skipToDay(1, 12));
await page.reload();
await page.waitForTimeout(2500);
await page.getByText('New Game').click();
const confirm = page.getByText('Start new game');
if (await confirm.isVisible().catch(() => false)) await confirm.click();
await page.waitForTimeout(1500);
await G(() => { window.__game.survivalOff(true); window.__game.setRain(0); window.__game.ownPlot('warehouse'); window.__game.state.at = 'base'; window.__game.skipToDay(1, 12); });
const before = await money();
const bought = await G(async () => {
  const e = await import('/src/sim/economy.ts');
  const r = e.placeOrder(window.__game.state, 'online', { fence_wood: 10, solar_panel: 2 });
  return { ok: r.ok, total: r.ok ? r.order.total : 0, perFence: e.returnValue('fence_wood') };
});
check('bought some items', bought.ok, JSON.stringify(bought));
const afterBuy = await money();
await page.keyboard.press('KeyI');
await page.waitForSelector('.drawer .line', { timeout: 15000 });
await page.waitForTimeout(500);
const fenceRow = page.locator('.drawer .line', { hasText: 'Wooden picket fence' });
check('storage rows have Return buttons', (await fenceRow.locator('.return-btn').count()) === 2, '(1 and All)');
const stockBefore = await G(() => window.__game.state.stores.online.fence_wood);
await fenceRow.locator('.return-btn', { hasText: 'All' }).click();
await page.waitForTimeout(600);
const afterReturn = await money();
const st = await G(() => ({ fences: window.__game.state.storage.fence_wood ?? 0, shelf: window.__game.state.stores.online.fence_wood }));
check('returning all fences gives the refund', afterReturn - afterBuy === bought.perFence * 10, `(+${afterReturn - afterBuy}, expected ${bought.perFence * 10})`);
check('they leave storage and go back on the shelf', st.fences === 0 && st.shelf === stockBefore + 10, JSON.stringify({ ...st, was: stockBefore }));
const fencePaid = await G(async () => { const e = await import('/src/sim/economy.ts'); return e.itemPrice('online', 'fence_wood', window.__game.state.worldSeconds) * 10; });
check('a return is worth less than what you paid', bought.perFence * 10 < fencePaid, `(refund ${bought.perFence * 10}, paid ${fencePaid})`);

// One at a time
const panelRow = page.locator('.drawer .line', { hasText: 'Solar panel' });
await panelRow.locator('.return-btn', { hasText: '1' }).click();
await page.waitForTimeout(500);
check('returning one at a time works', (await G(() => window.__game.state.storage.solar_panel)) === 1);

// Things the store does not sell cannot be returned
await G(() => window.__game.give('fresh_food', 2));
await page.waitForTimeout(700);
check('fresh produce has no Return button (the store does not sell it)', (await page.locator('.drawer .line', { hasText: 'Fresh produce' }).locator('.return-btn').count()) === 0);

// Refund does not follow panic prices
await G(() => window.__game.skipToDay(28, 12));
const late = await G(async () => { const e = await import('/src/sim/economy.ts'); return { refund: e.returnValue('fence_wood'), price: e.itemPrice('online', 'fence_wood', window.__game.state.worldSeconds) }; });
check('the refund stays the same when panic raises shop prices', late.refund === bought.perFence && late.price > fencePaid / 10, JSON.stringify(late));

// After the outbreak the shops are closed
await G(() => window.__game.skipToDay(30, 12));
await page.waitForTimeout(1200);
await page.keyboard.press('KeyI');
await page.waitForTimeout(400);
if (!(await page.locator('.drawer').isVisible())) await page.keyboard.press('KeyI');
await page.waitForTimeout(600);
check('after the outbreak nothing can be returned', (await page.locator('.drawer .return-btn').count()) === 0);
const late2 = await G(async () => { const e = await import('/src/sim/economy.ts'); return e.returnItems(window.__game.state, 'solar_panel', 1); });
check('and the rules agree', late2.ok === false && /closed/i.test(late2.reason), JSON.stringify(late2));

console.log(errors.length ? '--- console errors ---\n' + errors.join('\n') : 'no console errors');
await browser.close();
