import { city, inRect, locationById, type LocationId, type Rect } from '../data/city';
import type { GameState, PlaceId } from './state';

export interface MapPoint {
  x: number;
  z: number;
}

/** How close to a door (meters) the player must stand to count as being at that place. */
export const DOOR_RANGE = 5;
/** How far outside the edge of your land (meters) you still count as being at your base. */
export const BASE_RANGE = 6;

/** Where a place is on the map: a shop's door, or the middle of your plot. Null if it does not exist yet (no base before buying a plot). */
export function placePoint(state: GameState, place: PlaceId): MapPoint | null {
  if (place === 'outside') return null;
  if (place === 'base') {
    const plot = city.plots.find((p) => p.id === state.plotId);
    return plot ? { x: plot.bounds.x, z: plot.bounds.z } : null;
  }
  return locationById(place).entry;
}

/** The place the player is at, given where they stand. `land` is the ground they own, if any. */
export function locate(pos: MapPoint, land: Rect | null | undefined): PlaceId {
  let best: LocationId | null = null;
  let bestDist = DOOR_RANGE;
  for (const loc of city.locations) {
    const d = Math.hypot(loc.entry.x - pos.x, loc.entry.z - pos.z);
    if (d <= bestDist) {
      best = loc.id;
      bestDist = d;
    }
  }
  if (best) return best;
  if (land && inRect(land, pos.x, pos.z, BASE_RANGE)) return 'base';
  return 'outside';
}

/** Straight-line distance in meters from the player to a place, or null if the place does not exist yet. */
export function distanceTo(state: GameState, place: PlaceId): number | null {
  const p = placePoint(state, place);
  return p ? Math.hypot(p.x - state.pos.x, p.z - state.pos.z) : null;
}

/** Where a new game starts: at the motel door, facing the street. */
export function startPosition(): { x: number; z: number; heading: number } {
  const e = locationById('motel').entry;
  return { x: e.x, z: e.z, heading: 0 };
}