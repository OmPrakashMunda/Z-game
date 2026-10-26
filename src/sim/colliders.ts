import type { Rect } from '../data/city';
import { gridRectOf, isEdgeStructure, STRUCTURES } from '../data/structures';
import { gridOf } from './build';
import type { GameState } from './state';

/**
 * What the structures on the player's land block. The player and every vehicle are stopped by walls, fences, houses, tanks,
 * ponds and everything else that stands on the ground. They pass through gates (a gate is a way in), and walk over
 * things that lie flat or are only dug into the ground.
 */

/** Models that can be walked over or through. */
const OPEN = new Set(['gate', 'path', 'flowers', 'trench', 'spikes', 'orchard']);

/** How big a single-tile piece such as a lamp, tree or well is for walking into, in meters. A tile is 2 m. */
const SMALL = 1.4;

export function baseColliders(state: Pick<GameState, 'plotId' | 'expansion' | 'pieces'>): Rect[] {
  const grid = gridOf(state);
  if (!grid || state.pieces.length === 0) return [];
  const out: Rect[] = [];
  for (const p of state.pieces) {
    const def = STRUCTURES[p.type];
    if (!def || OPEN.has(def.look.model)) continue;
    const r = gridRectOf(def, p.cx, p.cz, p.rot);
    const x = grid.originX + r.x;
    const z = grid.originZ + r.z;
    if (isEdgeStructure(def)) {
      out.push({ x, z, w: r.w, d: r.d });
    } else if (r.w <= 2 && r.d <= 2) {
      out.push({ x, z, w: SMALL, d: SMALL });
    } else {
      out.push({ x, z, w: r.w - 0.2, d: r.d - 0.2 });
    }
  }
  return out;
}
