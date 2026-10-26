import { city, footprint, WORLD_HALF, type Rect } from '../data/city';
import { isCleared } from './clearing';
import { chunkCoord, getChunk, inWorldChunk } from './gen';

/** How close to the edge of the world the player may stand. */
const EDGE = 30;

/** Half-width of the box a tree trunk blocks. */
const TRUNK: Record<string, number> = { tree: 0.45, oak: 0.5, rock: 0.7 };

/** Everything solid near a point: the town's buildings and props, houses, and trees that have not been cleared. */
export function solidsNear(x: number, z: number, reach: number): Rect[] {
  const out: Rect[] = [];
  for (const c of city.colliders) {
    if (Math.abs(c.x - x) < c.w / 2 + reach && Math.abs(c.z - z) < c.d / 2 + reach) out.push(c);
  }
  const c0x = chunkCoord(x - reach);
  const c1x = chunkCoord(x + reach);
  const c0z = chunkCoord(z - reach);
  const c1z = chunkCoord(z + reach);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      if (!inWorldChunk(cx, cz)) continue;
      const chunk = getChunk(cx, cz);
      for (const h of chunk.houses) {
        const f = footprint(h);
        if (Math.abs(f.x - x) < f.w / 2 + reach && Math.abs(f.z - z) < f.d / 2 + reach) out.push({ x: f.x, z: f.z, w: f.w + 0.4, d: f.d + 0.4 });
      }
      for (const t of chunk.trees) {
        const half = TRUNK[t.kind];
        if (!half) continue;
        if (Math.abs(t.x - x) > half + reach || Math.abs(t.z - z) > half + reach) continue;
        if (isCleared(t.x, t.z)) continue;
        out.push({ x: t.x, z: t.z, w: half * 2, d: half * 2 });
      }
    }
  }
  return out;
}

/** Push a circle at (x, z) out of the box, if it overlaps. */
function pushOut(p: { x: number; z: number }, radius: number, r: Rect): void {
  const nx = Math.max(r.x - r.w / 2, Math.min(p.x, r.x + r.w / 2));
  const nz = Math.max(r.z - r.d / 2, Math.min(p.z, r.z + r.d / 2));
  let dx = p.x - nx;
  let dz = p.z - nz;
  const dist = Math.hypot(dx, dz);
  if (dist >= radius) return;
  if (dist < 1e-6) {
    // The centre is inside the box: leave by the nearest side
    const left = p.x - (r.x - r.w / 2);
    const right = r.x + r.w / 2 - p.x;
    const up = p.z - (r.z - r.d / 2);
    const down = r.z + r.d / 2 - p.z;
    const m = Math.min(left, right, up, down);
    if (m === left) p.x = r.x - r.w / 2 - radius;
    else if (m === right) p.x = r.x + r.w / 2 + radius;
    else if (m === up) p.z = r.z - r.d / 2 - radius;
    else p.z = r.z + r.d / 2 + radius;
    return;
  }
  dx /= dist;
  dz /= dist;
  p.x = nx + dx * radius;
  p.z = nz + dz * radius;
}

/**
 * Move a walker by (dx, dz), sliding along walls. Long moves are split into small steps so nothing is skipped through.
 * `radius` is the walker's size.
 */
export function moveWalker(pos: { x: number; z: number }, dx: number, dz: number, radius: number): { x: number; z: number } {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.4));
  const p = { x: pos.x, z: pos.z };
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    p.z += dz / steps;
    const solids = solidsNear(p.x, p.z, radius + 0.2);
    // Two passes so a corner between two boxes settles
    for (let pass = 0; pass < 2; pass++) for (const s of solids) pushOut(p, radius, s);
    const limit = WORLD_HALF - EDGE;
    p.x = Math.max(-limit, Math.min(limit, p.x));
    p.z = Math.max(-limit, Math.min(limit, p.z));
  }
  return p;
}

/** Whether a walker standing at (x, z) would overlap something solid. */
export function blockedAt(x: number, z: number, radius: number): boolean {
  for (const r of solidsNear(x, z, radius)) {
    const nx = Math.max(r.x - r.w / 2, Math.min(x, r.x + r.w / 2));
    const nz = Math.max(r.z - r.d / 2, Math.min(z, r.z + r.d / 2));
    if (Math.hypot(x - nx, z - nz) < radius) return true;
  }
  return false;
}
