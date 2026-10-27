import { WORLD_HALF } from '../data/city';
import { moveWalker, setBaseSolids } from '../world/collide';
import { unloadPack } from './cargo';
import { baseColliders } from './colliders';
import { landOf } from './land';
import { locate } from './places';
import type { GameState, PlaceId } from './state';
import { runtimeOf } from './utilities';
import { drivenVehicle, driveStep, type DriveInput } from './vehicles';

/** Walking and running speed in meters per second. */
export const WALK_SPEED = 4.6;
export const RUN_SPEED = 8;

/** How far the player is body-wide, for walking into things. */
const WALKER_RADIUS = 0.45;
/** The SPEED cheats and NOCLIP let the player go this close to the edge of the world. */
const NOCLIP_EDGE = WORLD_HALF - 30;
/** A drive step is never longer than this many seconds, so a fast vehicle cannot skip through a wall. */
const DRIVE_SUBSTEP = 0.04;
/** The longest stretch of time one call will drive for. A long frame is cut short rather than made up for. */
const DRIVE_MAX = 0.1;

/** Turn an angle toward another by the shorter way. */
export function turnToward(from: number, to: number, amount: number): number {
  const full = Math.PI * 2;
  const diff = ((((to - from) % full) + full + Math.PI) % full) - Math.PI;
  return from + diff * Math.min(1, amount);
}

/**
 * Work out where the player is from where they stand. At the base, on foot, the backpack is emptied into storage.
 * Returns the place, whether it changed, and how many kilograms were unloaded.
 */
export function settlePlace(state: GameState): { at: PlaceId; changed: boolean; unloadedKg: number } {
  const at = locate(state.pos, landOf(state) ?? null);
  let unloadedKg = 0;
  if (at === 'base' && state.driving === null && Object.keys(state.pack).length > 0) unloadedKg = unloadPack(state);
  const changed = at !== state.at;
  state.at = at;
  return { at, changed, unloadedKg };
}

/**
 * Walk for `dt` seconds toward a ground direction (any length; zero does nothing). Collides with the world and the player's
 * structures, faces the way of travel, and returns the speed reached in meters per second.
 */
export function walkStep(state: GameState, dir: { x: number; z: number }, sprint: boolean, dt: number): number {
  const len = Math.hypot(dir.x, dir.z);
  if (len === 0 || dt <= 0) return 0;
  setBaseSolids(baseColliders(state));
  const dx = dir.x / len;
  const dz = dir.z / len;
  const cheat = runtimeOf(state).cheats;
  const v = (sprint ? RUN_SPEED : WALK_SPEED) * (cheat.fastFeet ? 3 : 1);
  const clamp = (n: number) => Math.max(-NOCLIP_EDGE, Math.min(NOCLIP_EDGE, n));
  const next = cheat.noClip
    ? { x: clamp(state.pos.x + dx * v * dt), z: clamp(state.pos.z + dz * v * dt) }
    : moveWalker(state.pos, dx * v * dt, dz * v * dt, WALKER_RADIUS);
  const speed = Math.hypot(next.x - state.pos.x, next.z - state.pos.z) / dt;
  state.pos.x = next.x;
  state.pos.z = next.z;
  state.pos.heading = turnToward(state.pos.heading, Math.atan2(dx, dz), dt * 14);
  return speed;
}

export interface DriveOutcome {
  /** Hit points the vehicle lost in total. */
  damage: number;
  ranDry: boolean;
  brokeDown: boolean;
}

/**
 * Drive the vehicle the player is in for `dt` seconds, in short steps. A frame longer than a tenth of a second is cut to that.
 * Returns null if the player is not driving anything (and clears a driving id that points at a vehicle that is gone).
 */
export function driveFor(state: GameState, input: DriveInput, dt: number): DriveOutcome | null {
  const v = drivenVehicle(state);
  if (!v) {
    state.driving = null;
    return null;
  }
  setBaseSolids(baseColliders(state));
  const out: DriveOutcome = { damage: 0, ranDry: false, brokeDown: false };
  let left = Math.min(dt, DRIVE_MAX);
  while (left > 1e-6) {
    const step = Math.min(left, DRIVE_SUBSTEP);
    left -= step;
    const r = driveStep(state, v, input, step);
    out.damage += r.damage;
    out.ranDry ||= r.ranDry;
    out.brokeDown ||= r.brokeDown;
  }
  return out;
}
