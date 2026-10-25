import { balance } from '../data/balance';
import { city, locationById } from '../data/city';
import type { GameState, PlaceId } from './state';

export interface MapPoint {
  x: number;
  z: number;
}

/** Position of a place on the map, or null if it does not exist yet (no base before buying a plot). */
export function placePoint(state: GameState, place: PlaceId): MapPoint | null {
  if (place === 'base') {
    const plot = city.plots.find((p) => p.id === state.plotId);
    return plot ? { x: plot.bounds.x, z: plot.bounds.z } : null;
  }
  const b = locationById(place).building;
  return { x: b.x, z: b.z };
}

/** Game minutes needed to get from where the player is to a place. Zero if already there. */
export function travelMinutes(state: GameState, to: PlaceId): number {
  if (state.at === to) return 0;
  const from = placePoint(state, state.at);
  const dest = placePoint(state, to);
  if (!from || !dest) return 0;
  const dist = Math.hypot(from.x - dest.x, from.z - dest.z);
  return Math.max(5, Math.round(balance.travelBaseMinutes + dist * balance.travelMinutesPerMeter));
}

export function travelProblem(state: GameState, to: PlaceId): string | null {
  if (state.phase === 'dead') return 'You are dead.';
  if (to === 'base' && !state.plotId) return 'You do not have a base yet.';
  return null;
}
