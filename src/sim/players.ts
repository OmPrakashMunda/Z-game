import { starterOutfit, type Outfit } from '../data/clothing';
import type { DriveInput } from './vehicles';
import { applyCommand, type Command, type CommandResults } from './commands';
import { stepExposure } from './exposure';
import { emptySearchSlot, getSearchSlot, setSearchSlot, stepSearch, stopSearchIfLeft, type SearchSlot } from './loot';
import { driveFor, settlePlace, walkStep, type DriveOutcome } from './movement';
import { startPosition } from './places';
import type { Character, GameState, PlaceId, Position } from './state';
import { stepSim } from './step';

/** Most people that can share one world. */
export const MAX_PLAYERS = 4;

/**
 * What belongs to one player in a shared world. The rules read a single `GameState`, so while a player acts, their record is put
 * on the state (see `withPlayer`) and read back after. The money, storage, structures, land, vehicles, time and orders stay on
 * the state and are shared by everyone. The family's health, hunger and thirst are shared too.
 */
export interface PlayerRecord {
  id: string;
  character: Character;
  pos: Position;
  at: PlaceId;
  pack: Record<string, number>;
  outfit: Outfit;
  wet: number;
  /** Id of the vehicle this player is driving. */
  driving: number | null;
  search: SearchSlot;
}

export interface World {
  /** The shared world. Its player fields hold whoever acted last; use `withPlayer` to read or change a player. */
  state: GameState;
  players: Map<string, PlayerRecord>;
  /** Cheats are off in a shared world. */
  cheats: boolean;
}

/** Wrap a game as a shared world. Its player becomes the first player, `hostId`. */
export function createWorld(state: GameState, hostId: string): World {
  const world: World = { state, players: new Map(), cheats: false };
  world.players.set(hostId, {
    id: hostId,
    character: state.character,
    pos: state.pos,
    at: state.at,
    pack: state.pack,
    outfit: state.outfit,
    wet: state.wet,
    driving: state.driving,
    search: getSearchSlot(state),
  });
  return world;
}

/** Add a player who is just arriving: at the motel door, with the starter clothes and an empty pack. */
export function addPlayer(world: World, id: string, character: Character): PlayerRecord | { ok: false; reason: string } {
  if (world.players.has(id)) return { ok: false, reason: 'That player is already here.' };
  if (world.players.size >= MAX_PLAYERS) return { ok: false, reason: `The world is full (${MAX_PLAYERS} players).` };
  const spot = startPosition();
  const record: PlayerRecord = {
    id,
    character: { name: character.name, gender: character.gender, look: { ...character.look } },
    pos: { ...spot },
    at: 'motel',
    pack: {},
    outfit: starterOutfit(),
    wet: 0,
    driving: null,
    search: emptySearchSlot(),
  };
  world.players.set(id, record);
  return record;
}

/** A player leaves. A vehicle they were driving is left where it stopped. */
export function removePlayer(world: World, id: string): void {
  const rec = world.players.get(id);
  if (!rec) return;
  const v = world.state.vehicles.find((x) => x.id === rec.driving);
  if (v) v.speed = 0;
  world.players.delete(id);
}

/** Who is driving a vehicle, if anyone. */
export function driverOf(world: World, vehicleId: number): string | null {
  for (const p of world.players.values()) if (p.driving === vehicleId) return p.id;
  return null;
}

/**
 * Run `fn` with one player's record on the state. The record is read back afterwards, because some rules replace a field
 * (the backpack, for one) instead of changing it. The state object itself is never replaced: the rules keep notes against it.
 */
export function withPlayer<T>(world: World, id: string, fn: (state: GameState) => T): T {
  const rec = world.players.get(id);
  if (!rec) throw new Error(`No player ${id} in this world`);
  const s = world.state;
  s.character = rec.character;
  s.pos = rec.pos;
  s.at = rec.at;
  s.pack = rec.pack;
  s.outfit = rec.outfit;
  s.wet = rec.wet;
  s.driving = rec.driving;
  setSearchSlot(s, rec.search);
  try {
    return fn(s);
  } finally {
    rec.character = s.character;
    rec.pos = s.pos;
    rec.at = s.at;
    rec.pack = s.pack;
    rec.outfit = s.outfit;
    rec.wet = s.wet;
    rec.driving = s.driving;
  }
}

/** Run a command for a player. Two rules a single player never meets: no cheats, and one driver per vehicle. */
export function runCommand<C extends Command>(
  world: World,
  playerId: string,
  cmd: C,
): CommandResults[C['type']] | { ok: false; reason: string } {
  if (cmd.type === 'funds' && !world.cheats) return { ok: false, reason: 'Cheats are off in a shared world.' };
  if (cmd.type === 'enterVehicle') {
    const other = driverOf(world, cmd.vehicleId);
    if (other !== null && other !== playerId) return { ok: false, reason: 'Someone else is driving that.' };
  }
  return withPlayer(world, playerId, (s) => applyCommand(s, cmd));
}

/**
 * Walk a player toward a ground direction for `dt` seconds. A player in a vehicle does not walk. Returns the speed reached,
 * and what changed about where they are.
 */
export function walkPlayer(
  world: World,
  id: string,
  dir: { x: number; z: number },
  sprint: boolean,
  dt: number,
): { speed: number; at: PlaceId; changed: boolean; unloadedKg: number } {
  return withPlayer(world, id, (s) => {
    const speed = s.driving === null && s.phase !== 'dead' ? walkStep(s, dir, sprint, dt) : 0;
    stopSearchIfLeft(s, speed);
    return { speed, ...settlePlace(s) };
  });
}

/** Drive a player's vehicle for `dt` seconds. Null if they are not driving. */
export function drivePlayer(world: World, id: string, input: DriveInput, dt: number): DriveOutcome | null {
  return withPlayer(world, id, (s) => {
    const out = s.phase === 'dead' ? null : driveFor(s, input, dt);
    stopSearchIfLeft(s, 0);
    settlePlace(s);
    return out;
  });
}

/**
 * Advance the shared world. The clock and everything shared run once, for the first player's view. Each other player's own
 * parts (the weather on them, a search under way) run on their own view. An empty world does not move.
 */
export function stepWorld(world: World, realDt: number, worldDt: number): void {
  let first = true;
  for (const id of world.players.keys()) {
    if (first) {
      withPlayer(world, id, (s) => stepSim(s, realDt, worldDt));
      first = false;
    } else {
      withPlayer(world, id, (s) => {
        stepExposure(s, worldDt);
        stepSearch(s, worldDt);
      });
    }
  }
}
