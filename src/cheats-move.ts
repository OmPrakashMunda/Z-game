import type { CheatHost } from './cheats';
import { city, locationById, WORLD_HALF, type LocationId } from './data/city';
import { VEHICLE_LIST, VEHICLES, type VehicleId } from './data/vehicles';
import { unloadPack } from './sim/cargo';
import { ownedRect, plotOf } from './sim/land';
import { doorOf, houseState } from './sim/loot';
import { addVehicle, findDrivableSpot, moveTrailer, tankSize, vehicleDef } from './sim/vehicles';
import { runtimeOf } from './sim/utilities';
import { blockedAt } from './world/collide';
import { AREA_NAMES, areaAt, chunkCoord, housesInChunk, inWorldChunk } from './world/gen';

/**
 * The cheats for getting around: teleports, vehicles on demand, and switches for speed, walking through walls and carrying.
 * They are session-only like every cheat: the switches live in the runtime notes, and the one-off codes only change the game
 * the way the player could (move them, add a vehicle, fill a tank).
 */

/** Names for GOTO. */
const PLACES: Record<string, LocationId> = {
  motel: 'motel', realty: 'real_estate', hardware: 'hardware', supermarket: 'supermarket', pharmacy: 'pharmacy',
  guns: 'gun_shop', farmsupply: 'farm_supply', gas: 'gas_station', dealer: 'vehicle_dealer',
};
const PLOTS: Record<string, string> = { woods: 'woods', farmstead: 'farm', warehouse: 'warehouse', creekside: 'suburb' };
export const GOTO_NAMES = ['base', ...Object.keys(PLACES), ...Object.keys(PLOTS)];

/** The closest standing spot to (x, z) that nothing blocks. */
function freeSpot(x: number, z: number): { x: number; z: number } {
  const limit = WORLD_HALF - 32;
  const clamp = (v: number) => Math.max(-limit, Math.min(limit, v));
  for (let ring = 0; ring <= 8; ring++) {
    const steps = ring === 0 ? 1 : ring * 8;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = clamp(x + Math.cos(a) * ring * 1.6);
      const pz = clamp(z + Math.sin(a) * ring * 1.6);
      if (!blockedAt(px, pz, 0.7)) return { x: px, z: pz };
    }
  }
  return { x: clamp(x), z: clamp(z) };
}

function go(host: CheatHost, x: number, z: number, text: string): string {
  const spot = freeSpot(x, z);
  host.teleport(spot.x, spot.z);
  return text;
}

function nearestVehicle(host: CheatHost) {
  const { state } = host;
  let best = null as (typeof state.vehicles)[number] | null;
  let bestD = Infinity;
  for (const v of state.vehicles) {
    if (v.id === state.driving) continue;
    const d = Math.hypot(v.x - state.pos.x, v.z - state.pos.z);
    if (d < bestD) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

/** The unsearched house nearest the player, looking out to about 400 m. */
function nearestFreshHouse(host: CheatHost) {
  const { state } = host;
  const cx = chunkCoord(state.pos.x);
  const cz = chunkCoord(state.pos.z);
  let best = null as ReturnType<typeof housesInChunk>[number] | null;
  let bestD = Infinity;
  for (let a = cx - 5; a <= cx + 5; a++) {
    for (let b = cz - 5; b <= cz + 5; b++) {
      if (!inWorldChunk(a, b)) continue;
      for (const h of housesInChunk(a, b)) {
        if (houseState(state, h.id) !== 'fresh') continue;
        const d = Math.hypot(h.x - state.pos.x, h.z - state.pos.z);
        if (d < bestD) {
          best = h;
          bestD = d;
        }
      }
    }
  }
  return best;
}

const ALIASES: Record<string, VehicleId> = {
  bike: 'bicycle', moped: 'scooter', car: 'sedan', truck: 'truck', boxtruck: 'truck', pickuptruck: 'pickup', cargovan: 'van',
};

/** Run a getting-around cheat. Returns null if the word is not one of them. */
export function runMoveCheat(word: string, arg: string, host: CheatHost): string | null {
  const { state } = host;
  const c = runtimeOf(state).cheats;
  switch (word) {
    // ---- Switches
    case 'fastfeet':
      c.fastFeet = !c.fastFeet;
      return flip('FASTFEET', c.fastFeet, 'You walk and run three times as fast.');
    case 'noclip':
      c.noClip = !c.noClip;
      return flip('NOCLIP', c.noClip, 'Walls, houses, trees and fences no longer stop you or your vehicles.');
    case 'bigpack':
      c.bigPack = !c.bigPack;
      host.changed();
      return flip('BIGPACK', c.bigPack, 'Your backpack and your vehicles carry any weight.');
    case 'turbo':
      c.turbo = !c.turbo;
      return flip('TURBO', c.turbo, 'Vehicles are twice as fast and pick up speed twice as quickly.');

    // ---- Teleports
    case 'backtobase': {
      const plot = plotOf(state);
      if (!plot) return 'You have no base yet. Buy a plot first.';
      const land = ownedRect(plot, state.expansion);
      return go(host, land.x, land.z, 'Back at your base.');
    }
    case 'goto': {
      const name = arg.replace(/\s+/g, '');
      if (name === 'base') return runMoveCheat('backtobase', '', host);
      if (PLACES[name]) {
        const door = locationById(PLACES[name]).entry;
        return go(host, door.x, door.z, `You are at ${locationById(PLACES[name]).name}.`);
      }
      if (PLOTS[name]) {
        const plot = city.plots.find((p) => p.id === PLOTS[name])!;
        return go(host, plot.bounds.x, plot.bounds.z, `You are at ${plot.name}.`);
      }
      return `Use it like this: GOTO hardware. Places: ${GOTO_NAMES.join(', ')}.`;
    }
    case 'gotohouse': {
      const h = nearestFreshHouse(host);
      if (!h) return 'There is no unsearched house near you.';
      const door = doorOf(h);
      const away = Math.round(Math.hypot(h.x - state.pos.x, h.z - state.pos.z));
      host.teleport(door.x, door.z);
      return `At the door of a ${h.name.toLowerCase()}, ${away} m away. ${state.phase === 'outbreak' ? 'Press Space to search it.' : 'It can be searched after the outbreak.'}`;
    }
    case 'gotocar': {
      if (state.driving !== null) return 'You are already in a vehicle.';
      const v = nearestVehicle(host);
      if (!v) return 'You do not own a vehicle.';
      return go(host, v.x + 3, v.z, `Beside your ${vehicleDef(v).name.toLowerCase()}.`);
    }
    case 'callcar': {
      if (state.driving !== null) return 'You are already in a vehicle.';
      const v = nearestVehicle(host);
      if (!v) return 'You do not own a vehicle.';
      const ahead = vehicleDef(v).length / 2 + 2.2;
      const spot = findDrivableSpot(state, vehicleDef(v), { x: state.pos.x + Math.sin(state.pos.heading) * ahead, z: state.pos.z + Math.cos(state.pos.heading) * ahead, heading: state.pos.heading }, { except: v.id });
      v.x = spot.x;
      v.z = spot.z;
      v.heading = spot.heading;
      v.speed = 0;
      v.trailer = undefined;
      moveTrailer(v);
      host.changed();
      return `Your ${vehicleDef(v).name.toLowerCase()} is right beside you.`;
    }
    case 'gotowaypoint': {
      const w = host.getWaypoint();
      if (!w) return 'You have not set a waypoint. Click the map first.';
      return go(host, w.x, w.z, `At your waypoint: ${w.name}.`);
    }
    case 'coords': {
      const [a, b] = arg.split(/[\s,]+/).map(Number);
      const limit = WORLD_HALF - 32;
      if (![a, b].every(Number.isFinite)) return 'Use it like this: COORDS 150 -40';
      if (Math.abs(a) > limit || Math.abs(b) > limit) return `Pick numbers between -${limit} and ${limit}.`;
      return go(host, a, b, `You are at ${Math.round(a)}, ${Math.round(b)}.`);
    }
    case 'whereami': {
      const p = state.pos;
      const where = state.at === 'outside' ? AREA_NAMES[areaAt(p.x, p.z)] : state.at === 'base' ? 'your base' : locationById(state.at).name;
      return `x ${p.x.toFixed(0)}, z ${p.z.toFixed(0)}. ${where}. The world runs from -${WORLD_HALF} to ${WORLD_HALF}.`;
    }

    // ---- Vehicles and carrying
    case 'givecar': {
      const key = arg.replace(/\s+/g, '').toLowerCase();
      const id = (VEHICLE_LIST.find((v) => v.id === key || v.item === key)?.id ?? ALIASES[key] ?? (key === '' ? 'pickup' : null)) as VehicleId | null;
      if (!id) return `Use it like this: GIVECAR sedan. Vehicles: ${VEHICLE_LIST.map((v) => v.id).join(', ')}.`;
      const ahead = VEHICLES[id].length / 2 + 2.5;
      const spot = findDrivableSpot(state, VEHICLES[id], { x: state.pos.x + Math.sin(state.pos.heading) * ahead, z: state.pos.z + Math.cos(state.pos.heading) * ahead, heading: state.pos.heading });
      const v = addVehicle(state, id, spot);
      v.fuel = tankSize(v);
      host.changed();
      return `A ${VEHICLES[id].name.toLowerCase()} with a full tank is parked in front of you.`;
    }
    case 'refuelall': {
      for (const v of state.vehicles) v.fuel = vehicleDef(v).fuel === 'none' ? 0 : tankSize(v);
      host.changed();
      return state.vehicles.length ? `Done. ${state.vehicles.length} vehicle${state.vehicles.length === 1 ? '' : 's'} filled up.` : 'You do not own a vehicle.';
    }
    case 'repaircars': {
      for (const v of state.vehicles) v.hp = vehicleDef(v).durability;
      host.changed();
      return state.vehicles.length ? `Done. ${state.vehicles.length} vehicle${state.vehicles.length === 1 ? '' : 's'} repaired.` : 'You do not own a vehicle.';
    }
    case 'emptypack': {
      const kg = unloadPack(state);
      host.changed();
      return kg > 0 ? `Done. ${Math.round(kg)} kg moved from your backpack into storage.` : 'Your backpack is empty.';
    }
    case 'resethouses': {
      const n = Object.keys(state.looted).length;
      state.looted = {};
      host.changed();
      return n ? `Done. ${n} house${n === 1 ? ' is' : 's are'} full again.` : 'No house has been searched yet.';
    }
    default:
      return null;
  }
}

function flip(name: string, now: boolean, explain: string): string {
  return now ? `${name} on. ${explain} Type it again to turn it off.` : `${name} off.`;
}
