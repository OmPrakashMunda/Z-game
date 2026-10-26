import type { Rect } from '../data/city';

/**
 * The land the player owns is cleared of trees, and the woods just outside it are thinned so the base can be seen from
 * any side. The drawing code and the collision code both ask this module, so a tree that is not drawn never blocks the way.
 */

/** How far past your land trees are cleared, in meters. The view can turn all the way round, so every side gets the same. */
export const VIEW_CLEAR = 10;
/** Past that, the woods thin out over this fraction of the clearing distance. */
const VIEW_CLEAR_FEATHER = 0.6;
/** Standing room kept between the land and the nearest tree. */
const MARGIN = 1.2;

let land: Rect | null = null;

export function setClearing(r: Rect | null): void {
  land = r;
}

export function clearing(): Rect | null {
  return land;
}

/** How far from the land the clearing reaches at most. */
export const CLEAR_REACH = VIEW_CLEAR * (1 + VIEW_CLEAR_FEATHER) + MARGIN;

/** Whether the tree, bush or rock at (x, z) has been cleared away. */
export function isCleared(x: number, z: number): boolean {
  if (!land) return false;
  const dx = x - land.x;
  const dz = z - land.z;
  if (Math.abs(dx) <= land.w / 2 + MARGIN && Math.abs(dz) <= land.d / 2 + MARGIN) return true;
  const outX = Math.abs(dx) - land.w / 2;
  const outZ = Math.abs(dz) - land.d / 2;
  // 0 on the border, 1 at the edge of the full clearing; the corners are rounded
  const r = Math.hypot(Math.max(0, outX) / VIEW_CLEAR, Math.max(0, outZ) / VIEW_CLEAR);
  if (r < 1) return true;
  if (r >= 1 + VIEW_CLEAR_FEATHER) return false;
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s) < 1 - (r - 1) / VIEW_CLEAR_FEATHER;
}
