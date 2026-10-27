import { chromium } from 'playwright-core';
import { newGame } from './helpers.mjs';
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
const proj = (x, z) => G(([a, b]) => window.__game.project(a, b, 0), [x, z]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

await page.goto(`http://localhost:${PORT}/?quality=low`);
await page.waitForTimeout(2500);
await newGame(page);
await page.waitForTimeout(1200);
await G(() => { window.__game.setRain(0); window.__game.snapCamera(0, 0); window.__game.settleCamera(); });
await page.waitForTimeout(2500);

// Two ground points: one off-centre to the right and up (the pointer target), one near the centre
const P = [14, -6];
const Q = [0, 0];
const settle = async () => { await page.waitForTimeout(2500); };

async function zoomTest(label, notches, deltaY, anchor) {
  const before = await proj(...anchor);
  const spanBefore = dist(await proj(...P), await proj(...Q));
  await page.mouse.move(Math.round(before.x), Math.round(before.y));
  for (let i = 0; i < notches; i++) { await page.mouse.wheel(0, deltaY); await page.waitForTimeout(60); }
  await settle();
  const after = await proj(...anchor);
  const spanAfter = dist(await proj(...P), await proj(...Q));
  const drift = dist(before, after);
  check(`${label}: point under the pointer stays put`, drift < 3, `(moved ${drift.toFixed(1)} px; from ${before.x.toFixed(0)},${before.y.toFixed(0)})`);
  return { drift, scale: spanAfter / spanBefore };
}

const a = await proj(...P);
check('test point is on the canvas', a.x > 100 && a.x < 1180 && a.y > 100 && a.y < 600, `(${a.x.toFixed(0)},${a.y.toFixed(0)})`);

const zin = await zoomTest('zoom in at an off-centre point', 3, -100, P);
check('zoom in magnifies the view', zin.scale > 1.2, `(x${zin.scale.toFixed(2)})`);

// The anchor point has to move toward the screen centre only when zooming out, never when zooming in
const centre = { x: 640, y: 360 };
const pInPx = await proj(...P);
const zout = await zoomTest('zoom out at the same point', 4, 100, P);
check('zoom out shrinks the view', zout.scale < 0.85, `(x${zout.scale.toFixed(2)})`);

// A different pointer position uses a different anchor
const R = [-12, 8];
const rBefore = await proj(...R);
await page.mouse.move(Math.round(rBefore.x), Math.round(rBefore.y));
for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(60); }
await settle();
const rAfter = await proj(...R);
check('zoom in at another point keeps that point put', dist(rBefore, rAfter) < 3, `(moved ${dist(rBefore, rAfter).toFixed(1)} px)`);

// A trackpad sends small deltas: many small events add up to a smooth zoom
const tBefore = await proj(...P);
await page.mouse.move(Math.round(tBefore.x), Math.round(tBefore.y));
const span0 = dist(await proj(...P), await proj(...Q));
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, -8); await page.waitForTimeout(16); }
await settle();
const tAfter = await proj(...P);
const span1 = dist(await proj(...P), await proj(...Q));
check('small trackpad-style scrolls zoom smoothly', span1 > span0 * 1.1 && dist(tBefore, tAfter) < 3, `(x${(span1 / span0).toFixed(2)}, moved ${dist(tBefore, tAfter).toFixed(1)} px)`);

// Zoom limits still hold
for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -100);
await settle();
const minSpan = dist(await proj(...P), await proj(...Q));
for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
await settle();
const maxSpan = dist(await proj(...P), await proj(...Q));
check('zoom stops at the closest and farthest limits', minSpan > maxSpan * 3 && minSpan < 4000 && maxSpan > 5, `(close ${minSpan.toFixed(0)} px, far ${maxSpan.toFixed(0)} px)`);

await page.screenshot({ path: out + 'zoom-far.png' });
console.log(errors.length ? '--- console errors ---\n' + errors.join('\n') : 'no console errors');
await browser.close();
