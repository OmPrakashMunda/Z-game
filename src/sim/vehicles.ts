import { city, distanceToPath, inRect, locationById, WORLD_HALF, type Rect } from '../data/city';
import { itemById } from '../data/items';
import { STORES } from '../data/stores';
import {
  ATTACHMENTS, effective, PARTS_HP, SPARE_PARTS_ITEM, VEHICLES, type AttachmentId, type FuelKind, type VehicleDef, type VehicleId,
} from '../data/vehicles';
import { blockedAt, setBaseSolids } from '../world/collide';
import { nearRoad } from '../world/gen';
import { baseColliders } from './colliders';
import { ownedRect, plotOf } from './land';
import { runtimeOf } from './utilities';
import type { GameState } from './state';

/** A vehicle the player owns, parked or being driven. */
export interface OwnedVehicle {
  id: number;
  type: VehicleId;
  color: number;
  x: number;
  z: number;
  /** The way it faces: 0 faces +z. */
  heading: number;
  /** Meters per second, forward positive. Zero when parked. */
  speed: number;
  fuel: number;
  hp: number;
  /** Fitted parts (AttachmentId). */
  parts: string[];
  /** Where the trailer's axle is and the way it faces, once one is fitted. */
  trailer?: { x: number; z: number; heading: number };
  /** Goods being carried, by item id. */
  cargo: Record<string, number>;
}

export type Surface = 'road' | 'dirt' | 'grass';

const dirt = city.dirtRoads[0];

/** What a vehicle is driving on at a spot. Roads are fastest; open ground slows every vehicle, some more than others. */
export function surfaceAt(x: number, z: number): Surface {
  for (const r of city.roads) if (inRect(r, x, z, 0)) return 'road';
  for (const r of city.pavements) if (inRect(r, x, z, 0)) return 'road';
  if (nearRoad(x, z, 0)) return 'road';
  if (x > 80 && x < 155 && z > -45 && z < 15 && distanceToPath(dirt.path, x, z) < dirt.width / 2) return 'dirt';
  return 'grass';
}

export const vehicleDef = (v: OwnedVehicle): VehicleDef => VEHICLES[v.type];

export function vehicleById(state: GameState, id: number | null): OwnedVehicle | null {
  return id === null ? null : state.vehicles.find((v) => v.id === id) ?? null;
}

export function drivenVehicle(state: GameState): OwnedVehicle | null {
  return vehicleById(state, state.driving);
}

/** The vehicle closest to a point within `range` meters of its middle, if any. */
export function vehicleNear(state: GameState, x: number, z: number, range = 3.6): OwnedVehicle | null {
  let best: OwnedVehicle | null = null;
  let bestD = Infinity;
  for (const v of state.vehicles) {
    if (v.id === state.driving) continue;
    const d = Math.hypot(v.x - x, v.z - z) - vehicleDef(v).length * 0.25;
    if (d <= range && d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

/** Fuel the vehicle can take in its tank, in liters, counting fitted tanks. */
export function tankSize(v: OwnedVehicle): number {
  return effective(vehicleDef(v), v.parts).tank;
}

export function cargoSize(v: OwnedVehicle): number {
  return effective(vehicleDef(v), v.parts).cargo;
}

/** 0 to 1: how much of its hit points are left. */
export function condition(v: OwnedVehicle): number {
  return Math.max(0, Math.min(1, v.hp / vehicleDef(v).durability));
}

/** Top speed right now on a given surface, in meters per second. */
export function topSpeedOn(v: OwnedVehicle, surface: Surface): number {
  const def = vehicleDef(v);
  const grip = surface === 'road' ? 1 : surface === 'dirt' ? 0.85 + 0.15 * def.offroad : def.offroad;
  const c = condition(v);
  const wear = c < 0.3 ? 0.55 + 0.45 * (c / 0.3) : 1;
  const towing = effective(def, v.parts).trailer ? 0.92 : 1;
  return def.topSpeed * grip * wear * towing;
}

// ---------------------------------------------------------------- Buying and parking

/** How big a vehicle's body is on the ground, in meters. */
export interface BodySize {
  width: number;
  length: number;
}

const PARK_EDGE = WORLD_HALF - 30;

/** Whether a body of this size can stand at (x, z) facing `heading` with `margin` meters to spare on every side. */
export function bodyFits(size: BodySize, x: number, z: number, heading: number, margin = 0.6): boolean {
  if (Math.abs(x) > PARK_EDGE || Math.abs(z) > PARK_EDGE) return false;
  const r = size.width * 0.5 + margin;
  const reach = Math.max(0, size.length / 2 - size.width * 0.5);
  const n = Math.max(1, Math.ceil(reach / (r * 0.8)));
  const sx = Math.sin(heading);
  const sz = Math.cos(heading);
  for (let k = -n; k <= n; k++) if (blockedAt(x + (sx * reach * k) / n, z + (sz * reach * k) / n, r)) return false;
  return true;
}

/** Whether a vehicle parked here could drive away: a clear strip ahead of it, or behind it. */
function canLeave(size: BodySize, x: number, z: number, heading: number): boolean {
  const sx = Math.sin(heading);
  const sz = Math.cos(heading);
  const lead = size.length / 2 + 2;
  for (const dir of [1, -1]) {
    let clear = true;
    for (const d of [lead, lead + 4, lead + 8]) {
      if (!bodyFits(size, x + sx * d * dir, z + sz * d * dir, heading, 0.25)) {
        clear = false;
        break;
      }
    }
    if (clear) return true;
  }
  return false;
}

/** Whether another vehicle already stands too close to a spot. */
function crowded(state: GameState, size: BodySize, x: number, z: number, except?: number): boolean {
  return state.vehicles.some((v) => v.id !== except && Math.hypot(v.x - x, v.z - z) < Math.max(4.6, (size.length + vehicleDef(v).length) / 2 + 1));
}

/**
 * The nearest place to `want` where a vehicle can stand and drive off: all of its body is clear of walls, trees, houses and
 * your structures with room to spare, nothing else is parked there, and there is a clear strip to drive out along. It tries
 * the wanted heading first, then turned a quarter and a half turn. If the land is crowded it settles for tighter spots.
 */
export function findDrivableSpot(
  state: GameState,
  size: BodySize,
  want: { x: number; z: number; heading: number },
  opts: { avoid?: Rect; except?: number } = {},
): { x: number; z: number; heading: number } {
  setBaseSolids(baseColliders(state));
  const headings = [want.heading, want.heading + Math.PI / 2, want.heading - Math.PI / 2, want.heading + Math.PI];
  const a = opts.avoid;
  const onLand = (x: number, z: number) => !!a && Math.abs(x - a.x) < a.w / 2 + 1 && Math.abs(z - a.z) < a.d / 2 + 1;
  const passes: Array<{ margin: number; leave: boolean }> = [
    { margin: 0.7, leave: true },
    { margin: 0.35, leave: true },
    { margin: 0.2, leave: false },
  ];
  for (const pass of passes) {
    for (let ring = 0; ring <= 30; ring++) {
      const steps = ring === 0 ? 1 : Math.min(32, ring * 5);
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const x = want.x + Math.cos(ang) * ring * 2;
        const z = want.z + Math.sin(ang) * ring * 2;
        if (onLand(x, z) || crowded(state, size, x, z, opts.except)) continue;
        for (const h of headings) {
          if (bodyFits(size, x, z, h, pass.margin) && (!pass.leave || canLeave(size, x, z, h))) return { x, z, heading: h };
        }
      }
    }
  }
  return { ...want };
}

/** Where a new vehicle is parked: in front of Rusty Wheels Autos, or beside the player's land. It can always be driven away. */
export function parkingSpot(state: GameState, where: 'dealer' | 'base', size: number | BodySize): { x: number; z: number; heading: number } {
  const body: BodySize = typeof size === 'number' ? { width: size, length: size * 2.2 } : size;
  setBaseSolids(baseColliders(state));
  if (where === 'dealer') {
    const door = locationById('vehicle_dealer').entry;
    // Neat rows in front of the shop first
    for (let i = 0; i < 24; i++) {
      const x = door.x - 24 + (i % 8) * 6.2;
      const z = door.z + 11 + Math.floor(i / 8) * 7;
      if (!crowded(state, body, x, z) && bodyFits(body, x, z, Math.PI, 0.7) && canLeave(body, x, z, Math.PI)) return { x, z, heading: Math.PI };
    }
    return findDrivableSpot(state, body, { x: door.x, z: door.z + 30, heading: Math.PI });
  }
  const plot = plotOf(state);
  const land = plot ? ownedRect(plot, state.expansion) : { x: 0, z: 0, w: 10, d: 10 };
  return findDrivableSpot(state, body, { x: land.x + land.w / 2 + 7, z: land.z, heading: Math.PI / 2 }, { avoid: land });
}
/** Put a new vehicle on the map, fully fuelled and in perfect shape. */
export function addVehicle(state: GameState, id: VehicleId, at: { x: number; z: number; heading: number }): OwnedVehicle {
  const def = VEHICLES[id];
  const color = def.colors[Math.floor(((state.rngSeed + state.nextId * 7919) >>> 0) % def.colors.length)];
  const v: OwnedVehicle = {
    id: state.nextId++, type: id, color, x: at.x, z: at.z, heading: at.heading, speed: 0,
    fuel: def.fuel === 'none' ? 0 : Math.round(def.tank * 0.5), hp: def.durability, parts: [], cargo: {},
  };
  state.vehicles.push(v);
  return v;
}

// ---------------------------------------------------------------- Getting in and out

export function enterVehicle(state: GameState, id: number): { ok: true } | { ok: false; reason: string } {
  const v = vehicleById(state, id);
  if (!v) return { ok: false, reason: 'That vehicle is gone.' };
  if (state.driving !== null) return { ok: false, reason: 'You are already driving.' };
  if (state.phase === 'dead') return { ok: false, reason: 'You are dead.' };
  if (Math.hypot(v.x - state.pos.x, v.z - state.pos.z) > vehicleDef(v).length * 0.25 + 4) return { ok: false, reason: 'Walk up to it first.' };
  state.driving = v.id;
  v.speed = 0;
  state.pos.x = v.x;
  state.pos.z = v.z;
  state.pos.heading = v.heading;
  return { ok: true };
}

export function exitVehicle(state: GameState): { ok: true } | { ok: false; reason: string } {
  const v = drivenVehicle(state);
  if (!v) return { ok: false, reason: 'You are not in a vehicle.' };
  if (Math.abs(v.speed) > 4) return { ok: false, reason: 'Slow down before you get out.' };
  const def = vehicleDef(v);
  const side = def.width / 2 + 1.1;
  const left = { x: Math.cos(v.heading), z: -Math.sin(v.heading) };
  const spots = [
    { x: v.x + left.x * side, z: v.z + left.z * side },
    { x: v.x - left.x * side, z: v.z - left.z * side },
    { x: v.x - Math.sin(v.heading) * (def.length / 2 + 1.2), z: v.z - Math.cos(v.heading) * (def.length / 2 + 1.2) },
    { x: v.x + Math.sin(v.heading) * (def.length / 2 + 1.2), z: v.z + Math.cos(v.heading) * (def.length / 2 + 1.2) },
  ];
  const spot = spots.find((s) => !blockedAt(s.x, s.z, 0.45)) ?? spots[0];
  v.speed = 0;
  state.driving = null;
  state.pos.x = spot.x;
  state.pos.z = spot.z;
  return { ok: true };
}

// ---------------------------------------------------------------- Driving

export interface DriveInput {
  /** -1 (reverse) to 1 (forward). */
  throttle: number;
  /** -1 (left) to 1 (right), as the driver sees it. */
  steer: number;
  brake: boolean;
}

export interface DriveResult {
  /** Hit points lost this step. */
  damage: number;
  /** True on the step the tank ran dry. */
  ranDry: boolean;
  /** True on the step the vehicle broke down. */
  brokeDown: boolean;
}

const approach = (value: number, target: number, step: number) =>
  value < target ? Math.min(target, value + step) : Math.max(target, value - step);

/** Whether the vehicle's body would overlap something solid when placed at (x, z) facing `heading`. */
function hits(v: OwnedVehicle, x: number, z: number, heading: number): boolean {
  const def = vehicleDef(v);
  const r = def.width * 0.45;
  const reach = Math.max(0, def.length / 2 - r);
  const sx = Math.sin(heading);
  const sz = Math.cos(heading);
  // Three circles along the body: front, middle and back
  for (const k of [-1, 0, 1]) if (blockedAt(x + sx * reach * k, z + sz * reach * k, r)) return true;
  return false;
}

const EDGE = WORLD_HALF - 30;

/** Move the driven vehicle forward by one step of real time. The player's position follows it. */
export function driveStep(state: GameState, v: OwnedVehicle, input: DriveInput, dt: number): DriveResult {
  const def = vehicleDef(v);
  const cheats = runtimeOf(state).cheats;
  const result: DriveResult = { damage: 0, ranDry: false, brokeDown: false };
  const surface = surfaceAt(v.x, v.z);
  const boost = cheats.turbo ? 2 : 1;
  const maxV = topSpeedOn(v, surface) * boost;
  const wasRunning = v.hp > 0 && (def.fuel === 'none' || v.fuel > 0 || cheats.freeFuel);
  const running = wasRunning;
  const eff = effective(def, v.parts);
  const acc = def.accel * boost * (eff.trailer ? 0.8 : 1) * (surface === 'grass' ? 0.75 : 1);

  const throttle = running ? input.throttle : 0;
  if (throttle > 0) {
    if (v.speed < throttle * maxV) v.speed += (v.speed < 0 ? 14 : acc) * dt;
  } else if (throttle < 0) {
    if (v.speed > 0) v.speed -= 16 * dt;
    else v.speed = Math.max(-maxV * 0.3, v.speed + throttle * acc * 0.6 * dt);
  }
  if (input.brake) v.speed = approach(v.speed, 0, 22 * dt);
  // Rolling and air resistance
  const drag = (1.4 + 0.0016 * v.speed * v.speed) * dt;
  if (throttle === 0 || !running) v.speed = approach(v.speed, 0, drag);
  // Leaving the road, or a worn engine, bleeds speed off
  const over = Math.abs(v.speed) - maxV;
  if (over > 0) v.speed -= Math.sign(v.speed) * Math.min(over, 12 * dt);

  // Steering: sharper at low speed, and nothing happens while standing still
  const grip = Math.min(1, Math.abs(v.speed) / 3);
  const rate = (def.turn * input.steer * grip) / (1 + Math.abs(v.speed) / (def.topSpeed * 0.55));
  const turned = v.heading - rate * dt * Math.sign(v.speed || 1);
  if (Math.abs(v.speed) > 0.05 && (cheats.noClip || !hits(v, v.x, v.z, turned))) v.heading = turned;

  // Move, sliding along walls where possible
  const dx = Math.sin(v.heading) * v.speed * dt;
  const dz = Math.cos(v.heading) * v.speed * dt;
  const before = Math.abs(v.speed);
  const free = (x: number, z: number) => Math.abs(x) < EDGE && Math.abs(z) < EDGE && (cheats.noClip || !hits(v, x, z, v.heading));
  let moved = Math.hypot(dx, dz);
  if (free(v.x + dx, v.z + dz)) {
    v.x += dx;
    v.z += dz;
  } else if (Math.abs(dx) > 1e-4 && free(v.x + dx, v.z)) {
    v.x += dx;
    v.speed *= 0.93;
    result.damage += before * 0.01;
    moved = Math.abs(dx);
  } else if (Math.abs(dz) > 1e-4 && free(v.x, v.z + dz)) {
    v.z += dz;
    v.speed *= 0.93;
    result.damage += before * 0.01;
    moved = Math.abs(dz);
  } else if (before > 0.01) {
    // A head-on crash
    result.damage += before > 2 ? before * before * 0.1 : 0;
    v.speed = before > 2 ? -Math.sign(v.speed) * before * 0.15 : 0;
    moved = 0;
  }

  if (result.damage > 0 && !cheats.noDamage) {
    result.damage *= eff.crash;
    const had = v.hp;
    v.hp = Math.max(0, v.hp - result.damage);
    if (had > 0 && v.hp <= 0) result.brokeDown = true;
  } else {
    result.damage = 0;
  }

  // Fuel is used by distance
  if (def.fuel !== 'none' && !cheats.freeFuel && moved > 0) {
    const had = v.fuel;
    v.fuel = Math.max(0, v.fuel - (def.burn * (eff.trailer ? 1.25 : 1) * moved) / 1000);
    if (had > 0 && v.fuel <= 0) result.ranDry = true;
  }

  moveTrailer(v, def);
  state.pos.x = v.x;
  state.pos.z = v.z;
  state.pos.heading = v.heading;
  return result;
}

/** Keep the trailer behind its tow vehicle: the axle follows the hitch, so it swings wide on turns. */
export function moveTrailer(v: OwnedVehicle, def: VehicleDef = vehicleDef(v)): void {
  if (!v.parts.includes('trailer')) {
    v.trailer = undefined;
    return;
  }
  const arm = 2.7;
  const hx = v.x - Math.sin(v.heading) * (def.length / 2 + 0.3);
  const hz = v.z - Math.cos(v.heading) * (def.length / 2 + 0.3);
  const t = v.trailer;
  if (!t) {
    v.trailer = { x: hx - Math.sin(v.heading) * arm, z: hz - Math.cos(v.heading) * arm, heading: v.heading };
    return;
  }
  const dx = hx - t.x;
  const dz = hz - t.z;
  const len = Math.hypot(dx, dz) || 1;
  t.x = hx - (dx / len) * arm;
  t.z = hz - (dz / len) * arm;
  t.heading = Math.atan2(dx, dz);
}

// ---------------------------------------------------------------- Fuel and repairs

/** Which store item fills this vehicle. */
export const FUEL_ITEM: Record<Exclude<FuelKind, 'none'>, string> = { petrol: 'gasoline', diesel: 'diesel' };
/** Liters in one can. */
export const CAN_LITERS = 20;

/**
 * How many of an item are on hand for a job on this vehicle: what it carries, plus everything in storage when it is parked
 * at the base. Away from home you only have what you brought.
 */
export function onHand(state: GameState, v: OwnedVehicle, item: string): number {
  return (v.cargo[item] ?? 0) + (state.at === 'base' ? state.storage[item] ?? 0 : 0);
}

/** Use up items, taking from the vehicle's cargo first. */
export function takeOnHand(state: GameState, v: OwnedVehicle, item: string, n: number): void {
  const fromCargo = Math.min(n, v.cargo[item] ?? 0);
  if (fromCargo > 0) {
    v.cargo[item] -= fromCargo;
    if (v.cargo[item] <= 0) delete v.cargo[item];
  }
  const rest = n - fromCargo;
  if (rest > 0) state.storage[item] = Math.max(0, (state.storage[item] ?? 0) - rest);
}

/** Pour fuel cans (carried, or in storage at the base) into the tank. Returns the liters added. */
export function refuelFromCans(state: GameState, v: OwnedVehicle): { ok: true; liters: number } | { ok: false; reason: string } {
  const def = vehicleDef(v);
  if (def.fuel === 'none') return { ok: false, reason: 'A bicycle needs no fuel.' };
  const item = FUEL_ITEM[def.fuel];
  const room = tankSize(v) - v.fuel;
  if (room < 1) return { ok: false, reason: 'The tank is full.' };
  const cans = onHand(state, v, item);
  const word = def.fuel === 'petrol' ? 'gasoline' : 'diesel';
  if (cans < 1) return { ok: false, reason: `You have no ${word} cans here. Carry some in the vehicle, or park at your base.` };
  const used = Math.min(cans, Math.ceil(room / CAN_LITERS));
  const liters = Math.min(room, used * CAN_LITERS);
  takeOnHand(state, v, item, used);
  // A can that is more than half full is not thrown away
  if (used * CAN_LITERS - liters >= CAN_LITERS / 2) {
    if (state.at === 'base') state.storage[item] = (state.storage[item] ?? 0) + 1;
    else v.cargo[item] = (v.cargo[item] ?? 0) + 1;
  }
  v.fuel = Math.min(tankSize(v), v.fuel + liters);
  return { ok: true, liters };
}
/** Price per liter at the pump. */
export function pumpPrice(kind: Exclude<FuelKind, 'none'>): number {
  const store = STORES.gas_station!;
  const base = itemById(FUEL_ITEM[kind]).price * store.markup;
  return Math.round((base / CAN_LITERS) * 100) / 100;
}

/** The pumps are at the gas station's forecourt, and only work while the shops are open. */
export function atPump(state: GameState, v: OwnedVehicle): boolean {
  const door = locationById('gas_station').entry;
  return state.phase === 'prep' && Math.hypot(v.x - door.x, v.z - (door.z + 8)) < 13;
}

export function refuelAtPump(state: GameState, v: OwnedVehicle): { ok: true; liters: number; cost: number } | { ok: false; reason: string } {
  const def = vehicleDef(v);
  if (def.fuel === 'none') return { ok: false, reason: 'A bicycle needs no fuel.' };
  if (state.phase !== 'prep') return { ok: false, reason: 'The pumps have run dry since the outbreak.' };
  if (!atPump(state, v)) return { ok: false, reason: 'Park beside the pumps at Quick Fuel.' };
  const room = tankSize(v) - v.fuel;
  if (room < 1) return { ok: false, reason: 'The tank is full.' };
  const price = pumpPrice(def.fuel);
  const liters = Math.min(room, Math.floor(state.money / price));
  if (liters < 1) return { ok: false, reason: 'You cannot afford any fuel.' };
  const cost = Math.round(liters * price);
  state.money -= cost;
  v.fuel += liters;
  return { ok: true, liters, cost };
}

/** Mend a vehicle with spare parts (carried, or in storage at the base). */
export function repairVehicle(state: GameState, v: OwnedVehicle): { ok: true; restored: number; used: number } | { ok: false; reason: string } {
  const def = vehicleDef(v);
  const missing = def.durability - v.hp;
  if (missing < 1) return { ok: false, reason: 'It is in perfect shape.' };
  const free = runtimeOf(state).cheats.freeWork;
  const have = onHand(state, v, SPARE_PARTS_ITEM);
  if (have < 1 && !free) return { ok: false, reason: 'You need spare parts here. Carry some in the vehicle, or park at your base.' };
  const need = Math.ceil(missing / PARTS_HP);
  const used = free ? 0 : Math.min(have, need);
  const restored = free ? missing : Math.min(missing, used * PARTS_HP);
  if (used > 0) takeOnHand(state, v, SPARE_PARTS_ITEM, used);
  v.hp = Math.min(def.durability, v.hp + restored);
  return { ok: true, restored, used };
}
// ---------------------------------------------------------------- Fitting parts

export function fitProblem(state: GameState, v: OwnedVehicle, part: AttachmentId): string | null {
  const a = ATTACHMENTS[part];
  if (!a.fits.includes(v.type)) return `It does not fit a ${vehicleDef(v).name.toLowerCase()}.`;
  if (v.parts.includes(part)) return 'It is already fitted.';
  if (a.requires && !v.parts.includes(a.requires)) return `Fit the ${ATTACHMENTS[a.requires].name.toLowerCase()} first.`;
  if (part === 'trailer' && vehicleDef(v).tow < (a.weight ?? 0)) return 'It is too weak to tow that.';
  if (state.at !== 'base') return 'Fit and remove parts at your base, where your storage is.';
  if ((state.storage[a.item] ?? 0) < 1) return `You have no ${a.name.toLowerCase()} in storage.`;
  return null;
}

export function fitPart(state: GameState, v: OwnedVehicle, part: AttachmentId): { ok: true } | { ok: false; reason: string } {
  const problem = fitProblem(state, v, part);
  if (problem) return { ok: false, reason: problem };
  const a = ATTACHMENTS[part];
  state.storage[a.item] = (state.storage[a.item] ?? 0) - 1;
  v.parts.push(part);
  moveTrailer(v);
  return { ok: true };
}

export function removePart(state: GameState, v: OwnedVehicle, part: AttachmentId): { ok: true } | { ok: false; reason: string } {
  if (!v.parts.includes(part)) return { ok: false, reason: 'That is not fitted.' };
  if (part === 'tow_hitch' && v.parts.includes('trailer')) return { ok: false, reason: 'Unhitch the trailer first.' };
  if (state.driving === v.id) return { ok: false, reason: 'Get out first.' };
  if (state.at !== 'base') return { ok: false, reason: 'Fit and remove parts at your base, where your storage is.' };
  const a = ATTACHMENTS[part];
  v.parts = v.parts.filter((p) => p !== part);
  state.storage[a.item] = (state.storage[a.item] ?? 0) + 1;
  v.fuel = Math.min(v.fuel, tankSize(v));
  moveTrailer(v);
  return { ok: true };
}

// ---------------------------------------------------------------- Buying

/**
 * Turn vehicles that were just bought into real ones. Called after an order: vehicle items are taken back out of storage
 * and parked, at the dealership if you bought them there, or beside your land if you ordered online.
 */
export function deliverVehicles(state: GameState, from: 'dealer' | 'base'): OwnedVehicle[] {
  const made: OwnedVehicle[] = [];
  for (const def of Object.values(VEHICLES)) {
    const n = state.storage[def.item] ?? 0;
    if (n < 1) continue;
    for (let i = 0; i < n; i++) made.push(addVehicle(state, def.id, parkingSpot(state, from, def)));
    delete state.storage[def.item];
  }
  return made;
}

/** The heaviest load of goods, in kilograms, a vehicle's cargo holds right now. */
export function cargoWeight(v: OwnedVehicle, weightOf: (id: string) => number): number {
  let sum = 0;
  for (const [id, n] of Object.entries(v.cargo)) sum += weightOf(id) * n;
  return sum;
}
