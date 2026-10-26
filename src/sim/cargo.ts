import { itemById } from '../data/items';
import { isCarriable, PACK_KG, weightOf, weightOfAll } from '../data/weights';
import { effective } from '../data/vehicles';
import { runtimeOf } from './utilities';
import { vehicleDef, type OwnedVehicle } from './vehicles';
import type { GameState } from './state';

/** Moving goods between storage, the backpack and a vehicle's load space. */

export const packWeight = (state: GameState) => weightOfAll(state.pack);
/** Room left in the backpack in kilograms. The BIGPACK cheat removes the limit. */
export const packRoom = (state: GameState) => (runtimeOf(state).cheats.bigPack ? 1e9 : Math.max(0, PACK_KG - packWeight(state)));

export function loadWeight(v: OwnedVehicle): number {
  return weightOfAll(v.cargo);
}

export function loadRoom(v: OwnedVehicle, state?: GameState): number {
  if (state && runtimeOf(state).cheats.bigPack) return 1e9;
  return Math.max(0, effective(vehicleDef(v), v.parts).cargo - loadWeight(v));
}

/** How far from the player a vehicle still counts as being at hand for loading loot. */
export const AT_HAND = 18;

/** The closest vehicle within reach that can still take something, or null. */
export function vehicleAtHand(state: GameState, x: number, z: number): OwnedVehicle | null {
  let best: OwnedVehicle | null = null;
  let bestD = AT_HAND;
  for (const v of state.vehicles) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < bestD && loadRoom(v, state) > 0.5) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

function add(into: Record<string, number>, item: string, n: number): void {
  into[item] = (into[item] ?? 0) + n;
}

function take(from: Record<string, number>, item: string, n: number): void {
  from[item] = (from[item] ?? 0) - n;
  if (from[item] <= 0) delete from[item];
}

/**
 * Pick up goods: into a vehicle that is at hand if there is room, otherwise the backpack. Returns what was picked up
 * and what did not fit.
 */
export function pickUp(state: GameState, goods: Record<string, number>): { took: Record<string, number>; left: Record<string, number> } {
  const took: Record<string, number> = {};
  const left: Record<string, number> = {};
  for (const [id, want] of Object.entries(goods)) {
    let n = want;
    const w = weightOf(id);
    // Vehicle first
    const v = vehicleAtHand(state, state.pos.x, state.pos.z);
    if (v && n > 0) {
      const fit = Math.min(n, Math.floor(loadRoom(v, state) / w + 1e-6));
      if (fit > 0) {
        add(v.cargo, id, fit);
        add(took, id, fit);
        n -= fit;
      }
    }
    if (n > 0) {
      const fit = Math.min(n, Math.floor(packRoom(state) / w + 1e-6));
      if (fit > 0) {
        add(state.pack, id, fit);
        add(took, id, fit);
        n -= fit;
      }
    }
    if (n > 0) add(left, id, n);
  }
  return { took, left };
}

/** Empty the backpack into storage. Needs the player to be at the base. */
export function unloadPack(state: GameState): number {
  let kg = 0;
  for (const [id, n] of Object.entries(state.pack)) {
    state.storage[id] = (state.storage[id] ?? 0) + n;
    kg += weightOf(id) * n;
  }
  state.pack = {};
  return kg;
}

/** Move goods from storage into a vehicle (at the base only). Returns how many were loaded. */
export function loadFromStorage(state: GameState, v: OwnedVehicle, item: string, n: number): number {
  if (state.at !== 'base' || !isCarriable(item)) return 0;
  const w = weightOf(item);
  const fit = Math.min(n, state.storage[item] ?? 0, Math.floor(loadRoom(v, state) / w + 1e-6));
  if (fit <= 0) return 0;
  take(state.storage, item, fit);
  add(v.cargo, item, fit);
  return fit;
}

/** Move goods from a vehicle into storage (at the base only). Returns how many were unloaded. */
export function unloadToStorage(state: GameState, v: OwnedVehicle, item: string, n: number): number {
  if (state.at !== 'base') return 0;
  const fit = Math.min(n, v.cargo[item] ?? 0);
  if (fit <= 0) return 0;
  take(v.cargo, item, fit);
  add(state.storage, item, fit);
  return fit;
}

/** "3 canned food, 2 rice" */
export function describeGoods(goods: Record<string, number>): string {
  const parts = Object.entries(goods)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${n} ${itemById(id).name.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nothing';
}
