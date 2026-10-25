import { balance } from '../data/balance';
import { city, distanceToPath, type PlotDef, type Rect } from '../data/city';
import { CELL } from '../data/structures';
import { addMessage } from './messages';
import type { Expansion, GameState } from './state';

export type Side = 'n' | 'e' | 's' | 'w';
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** Length of one expansion strip in meters. */
export const LAND_STEP = balance.landStepCells * CELL;

const EDGE = { minX: -150, maxX: 250, minZ: -130, maxZ: 130 };

export function plotOf(state: Pick<GameState, 'plotId'>): PlotDef | null {
  return city.plots.find((p) => p.id === state.plotId) ?? null;
}

/** The land you own: the plot plus everything you bought next to it. */
export function ownedRect(plot: PlotDef, exp: Expansion): Rect {
  const x0 = plot.bounds.x - plot.bounds.w / 2 - exp.w * LAND_STEP;
  const x1 = plot.bounds.x + plot.bounds.w / 2 + exp.e * LAND_STEP;
  const z0 = plot.bounds.z - plot.bounds.d / 2 - exp.n * LAND_STEP;
  const z1 = plot.bounds.z + plot.bounds.d / 2 + exp.s * LAND_STEP;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

/** The new ground you would get from one more expansion on a side. */
export function stripFor(plot: PlotDef, exp: Expansion, side: Side): Rect {
  const r = ownedRect(plot, exp);
  const x0 = r.x - r.w / 2;
  const x1 = r.x + r.w / 2;
  const z0 = r.z - r.d / 2;
  const z1 = r.z + r.d / 2;
  switch (side) {
    case 'e': return { x: x1 + LAND_STEP / 2, z: r.z, w: LAND_STEP, d: r.d };
    case 'w': return { x: x0 - LAND_STEP / 2, z: r.z, w: LAND_STEP, d: r.d };
    case 'n': return { x: r.x, z: z0 - LAND_STEP / 2, w: r.w, d: LAND_STEP };
    case 's': return { x: r.x, z: z1 + LAND_STEP / 2, w: r.w, d: LAND_STEP };
  }
}

export function expansionPrice(plot: PlotDef, exp: Expansion, side: Side): number {
  const strip = stripFor(plot, exp, side);
  const perSquareMeter = plot.price / (plot.bounds.w * plot.bounds.d);
  const raw = strip.w * strip.d * perSquareMeter * balance.landPriceFactor * (1 + balance.landPriceGrowth * exp[side]);
  return Math.round(raw / 10) * 10;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin - 1e-6 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin - 1e-6;
}

/** What stops the strip from being bought, or null if it is free. */
function blocker(strip: Rect, ownPlotId: string): string | null {
  if (
    strip.x - strip.w / 2 < EDGE.minX || strip.x + strip.w / 2 > EDGE.maxX ||
    strip.z - strip.d / 2 < EDGE.minZ || strip.z + strip.d / 2 > EDGE.maxZ
  ) return 'That is the edge of the map.';
  for (const p of city.plots) if (p.id !== ownPlotId && overlaps(strip, p.bounds)) return `${p.name} is next door, so that land is not for sale.`;
  for (const r of city.roads) if (overlaps(strip, r)) return 'A road runs along that side.';
  for (const b of city.buildings) if (overlaps(strip, b, 1)) return 'A building stands on that land.';
  for (const road of city.dirtRoads) {
    for (let x = strip.x - strip.w / 2; x <= strip.x + strip.w / 2; x += 2) {
      for (let z = strip.z - strip.d / 2; z <= strip.z + strip.d / 2; z += 2) {
        if (distanceToPath(road.path, x, z) < road.width / 2 + 1) return 'The dirt road runs along that side.';
      }
    }
  }
  return null;
}

export function expansionProblem(state: GameState, side: Side): string | null {
  const plot = plotOf(state);
  if (!plot) return 'Buy a base plot first.';
  if (state.phase !== 'prep') return 'The realty office has closed.';
  if (state.expansion[side] >= balance.landMaxSteps) return 'You already own as much as you can on that side.';
  const strip = stripFor(plot, state.expansion, side);
  const blocked = blocker(strip, plot.id);
  if (blocked) return blocked;
  const price = expansionPrice(plot, state.expansion, side);
  if (price > state.money) return `You need $${(price - state.money).toLocaleString('en-US')} more.`;
  return null;
}

export function expandPlot(state: GameState, side: Side): { ok: true; price: number } | { ok: false; reason: string } {
  const problem = expansionProblem(state, side);
  if (problem) return { ok: false, reason: problem };
  const plot = plotOf(state)!;
  const price = expansionPrice(plot, state.expansion, side);
  state.money -= price;
  state.expansion[side] += 1;
  const r = ownedRect(plot, state.expansion);
  addMessage(state, `You bought more land for $${price.toLocaleString('en-US')}. You now own ${r.w} x ${r.d} m.`, 'info');
  return { ok: true, price };
}
