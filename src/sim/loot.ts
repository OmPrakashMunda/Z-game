import type { BuildingDef, HouseType } from '../data/city';
import { ITEMS } from '../data/items';
import { chunkCoord, housesInChunk, houseById, inWorldChunk } from '../world/gen';
import { describeGoods, pickUp } from './cargo';
import { addMessage } from './messages';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import { runtimeOf } from './utilities';

/**
 * After the outbreak every house can be searched once. What is inside is decided by the house's id and the game's seed,
 * so it never changes between visits or reloads: houses far from town hold more, farmhouses hold fuel and seed, cabins
 * hold tools and hunting gear, and a few have already been picked clean.
 */

type Tag = 'food' | 'water' | 'household' | 'medical' | 'tools' | 'fuel' | 'materials' | 'farm' | 'weapons' | 'parts' | 'clothes';

/** [item, fewest, most, weight, tag] */
const TABLE: Array<[string, number, number, number, Tag]> = [
  ['canned_food', 1, 3, 10, 'food'], ['canned_veg', 1, 2, 6, 'food'], ['rice', 1, 1, 4, 'food'], ['dry_beans', 1, 1, 4, 'food'],
  ['pasta', 1, 2, 5, 'food'], ['peanut_butter', 1, 1, 3, 'food'], ['protein_bars', 1, 1, 3, 'food'], ['cooking_oil', 1, 1, 3, 'food'],
  ['salt_sugar', 1, 1, 3, 'food'],
  ['bottled_water', 1, 2, 9, 'water'], ['water_tablets', 1, 1, 2, 'water'],
  ['matches', 1, 1, 4, 'household'], ['candles', 1, 1, 3, 'household'], ['batteries', 1, 1, 3, 'household'], ['toilet_paper', 1, 1, 2, 'household'],
  ['soap', 1, 1, 2, 'household'], ['trash_bags', 1, 1, 1, 'household'],
  ['bandages', 1, 1, 5, 'medical'], ['antiseptic', 1, 1, 4, 'medical'], ['painkillers', 1, 1, 4, 'medical'], ['first_aid_kit', 1, 1, 2, 'medical'],
  ['vitamins', 1, 1, 2, 'medical'], ['antibiotics', 1, 1, 1, 'medical'],
  ['shovel', 1, 1, 2, 'tools'], ['crowbar', 1, 1, 2, 'tools'], ['axe', 1, 1, 2, 'tools'], ['toolbox', 1, 1, 1, 'tools'], ['flood_light', 1, 1, 1, 'tools'],
  ['gasoline', 1, 2, 2, 'fuel'], ['diesel', 1, 1, 1, 'fuel'], ['motor_oil', 1, 1, 2, 'fuel'], ['jerry_can', 1, 1, 1, 'fuel'],
  ['nails', 1, 1, 2, 'materials'], ['screws', 1, 1, 2, 'materials'], ['padlock', 1, 1, 1, 'materials'], ['lumber', 1, 1, 1, 'materials'],
  ['sandbags', 1, 1, 1, 'materials'],
  ['spare_parts', 1, 1, 2, 'parts'],
  ['tshirt', 1, 1, 3, 'clothes'], ['hoodie', 1, 1, 3, 'clothes'], ['jeans', 1, 1, 3, 'clothes'], ['sneakers', 1, 1, 2, 'clothes'],
  ['baseball_cap', 1, 1, 2, 'clothes'], ['wool_beanie', 1, 1, 2, 'clothes'], ['jacket', 1, 1, 2, 'clothes'], ['raincoat', 1, 1, 1.5, 'clothes'],
  ['rain_hat', 1, 1, 1, 'clothes'], ['rubber_boots', 1, 1, 1.2, 'clothes'], ['hiking_boots', 1, 1, 1.2, 'clothes'], ['work_gloves', 1, 1, 1.5, 'clothes'],
  ['cargo_pants', 1, 1, 1.5, 'clothes'], ['thermal_pants', 1, 1, 0.8, 'clothes'], ['winter_gloves', 1, 1, 0.8, 'clothes'],
  ['winter_boots', 1, 1, 0.6, 'clothes'], ['parka', 1, 1, 0.5, 'clothes'], ['rain_pants', 1, 1, 0.6, 'clothes'],
  ['seeds_veg', 1, 2, 2, 'farm'], ['seeds_corn', 1, 1, 1, 'farm'], ['animal_feed', 1, 1, 1, 'farm'], ['fertilizer', 1, 1, 1, 'farm'], ['seed_potatoes', 1, 1, 1, 'farm'],
  ['bat', 1, 1, 1, 'weapons'], ['machete', 1, 1, 0.6, 'weapons'], ['ammo_9mm', 1, 1, 0.8, 'weapons'], ['shells', 1, 1, 0.6, 'weapons'],
  ['pistol', 1, 1, 0.3, 'weapons'], ['rifle', 1, 1, 0.2, 'weapons'],
];

for (const [id] of TABLE) if (!ITEMS[id]) throw new Error(`Loot table lists unknown item "${id}"`);

const BIAS: Record<HouseType, Record<Tag, number>> = {
  bungalow: { food: 1.2, water: 1, household: 1.3, medical: 1, tools: 0.6, fuel: 0.4, materials: 0.5, farm: 0.2, weapons: 0.3, parts: 0.4, clothes: 1.1 },
  family: { food: 1.2, water: 1, household: 1.1, medical: 1.1, tools: 1, fuel: 1, materials: 1, farm: 0.4, weapons: 0.4, parts: 1, clothes: 1.2 },
  villa: { food: 1, water: 1.2, household: 1, medical: 1.6, tools: 1.3, fuel: 1, materials: 0.8, farm: 0.2, weapons: 0.8, parts: 1, clothes: 1.4 },
  farmhouse: { food: 1.3, water: 1, household: 0.8, medical: 0.8, tools: 1.4, fuel: 2, materials: 1.2, farm: 3, weapons: 0.8, parts: 1.2, clothes: 1.2 },
  cabin: { food: 1, water: 1.2, household: 0.7, medical: 0.6, tools: 1.6, fuel: 0.8, materials: 1.6, farm: 0.3, weapons: 1.8, parts: 0.5, clothes: 1.5 },
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** What is in a house, before anyone takes it. An empty object means it has already been picked clean. */
export function lootInside(seed: number, house: BuildingDef): { goods: Record<string, number>; quality: number } {
  const rand = mulberry32(hashString(house.id) ^ (seed >>> 0));
  const remote = Math.min(0.6, Math.hypot(house.x, house.z) / 1500);
  const quality = 0.7 + rand() * 0.6 + remote;
  const picked = rand() < 0.1;
  if (picked) return { goods: {}, quality };
  const bias = BIAS[house.houseType ?? 'family'];
  const weights = TABLE.map((t) => t[3] * bias[t[4]]);
  const total = weights.reduce((a, b) => a + b, 0);
  const picks = Math.round(2.5 + quality * 2.5 + rand());
  const goods: Record<string, number> = {};
  for (let i = 0; i < picks; i++) {
    let roll = rand() * total;
    let k = 0;
    while (k < weights.length - 1 && roll >= weights[k]) roll -= weights[k++];
    const [id, lo, hi] = TABLE[k];
    const qty = lo + Math.floor(rand() * (hi - lo + 1)) + (quality > 1.25 && i === 0 ? 1 : 0);
    goods[id] = (goods[id] ?? 0) + qty;
  }
  return { goods, quality };
}

// ---------------------------------------------------------------- Doors

/** The spot in front of a house's door, where the player stands to search it. */
export function doorOf(h: BuildingDef): { x: number; z: number } {
  const lx = -h.w / 4;
  const lz = h.d / 2 + 1.7;
  const a = h.facing === 'S' ? 0 : h.facing === 'N' ? Math.PI : h.facing === 'E' ? Math.PI / 2 : -Math.PI / 2;
  return { x: h.x + lx * Math.cos(a) + lz * Math.sin(a), z: h.z - lx * Math.sin(a) + lz * Math.cos(a) };
}

/** How close to the door (meters) counts as being at it. */
export const DOOR_REACH = 3.2;

/** The house whose door the player is standing at, if any. */
export function houseAtDoor(x: number, z: number): BuildingDef | null {
  const cx = chunkCoord(x);
  const cz = chunkCoord(z);
  let best: BuildingDef | null = null;
  let bestD = DOOR_REACH;
  for (let a = cx - 1; a <= cx + 1; a++) {
    for (let b = cz - 1; b <= cz + 1; b++) {
      if (!inWorldChunk(a, b)) continue;
      for (const h of housesInChunk(a, b)) {
        const d = doorOf(h);
        const dist = Math.hypot(d.x - x, d.z - z);
        if (dist < bestD) {
          best = h;
          bestD = dist;
        }
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- Searching

export interface Search {
  houseId: string;
  name: string;
  /** Game seconds left. */
  remaining: number;
  total: number;
}

export interface SearchResult {
  houseId: string;
  name: string;
  took: Record<string, number>;
  left: Record<string, number>;
  empty: boolean;
}

interface Searching {
  current: Search | null;
  results: SearchResult[];
}

const searching = new WeakMap<GameState, Searching>();

function slot(state: GameState): Searching {
  let s = searching.get(state);
  if (!s) {
    s = { current: null, results: [] };
    searching.set(state, s);
  }
  return s;
}

export const activeSearch = (state: GameState): Search | null => slot(state).current;

/** How long searching a house takes, in game seconds. */
export function searchSeconds(h: BuildingDef): number {
  return Math.round(6 + (h.w * h.d) / 14) * 60;
}

export function searchProblem(state: GameState): string | null {
  if (state.phase === 'prep') return 'People still live here. After the outbreak the houses will be empty.';
  if (state.phase === 'dead') return 'You are dead.';
  if (state.driving !== null) return 'Get out of the vehicle first.';
  if (slot(state).current) return 'You are already searching.';
  return null;
}

/** Where a house stands: untouched, searched, or searched with goods left behind that did not fit. */
export function houseState(state: GameState, houseId: string): 'fresh' | 'searched' | 'leftovers' {
  const l = state.looted[houseId];
  if (!l) return 'fresh';
  return Object.values(l.left).some((n) => n > 0) ? 'leftovers' : 'searched';
}

export function startSearch(state: GameState, houseId: string): { ok: true } | { ok: false; reason: string } {
  const h = houseById(houseId);
  if (!h) return { ok: false, reason: 'There is nothing to search.' };
  const problem = searchProblem(state);
  if (problem) return { ok: false, reason: problem };
  if (houseState(state, houseId) !== 'fresh') return { ok: false, reason: 'You have already searched here.' };
  const total = runtimeOf(state).cheats.quickSearch ? 1 : searchSeconds(h);
  slot(state).current = { houseId, name: h.name, remaining: total, total };
  return { ok: true };
}

export function cancelSearch(state: GameState): void {
  slot(state).current = null;
}

/** A search stops if the player walks off from the door or gets into a vehicle. Returns true if it was stopped. */
export function stopSearchIfLeft(state: GameState, walkSpeed: number): boolean {
  const sr = slot(state).current;
  if (!sr) return false;
  const h = houseById(sr.houseId);
  const door = h ? doorOf(h) : null;
  const gone = !door || Math.hypot(door.x - state.pos.x, door.z - state.pos.z) > DOOR_REACH + 1.5;
  if (!gone && walkSpeed <= 0.3 && state.driving === null) return false;
  slot(state).current = null;
  return true;
}

/** A player's search in progress and their results not yet shown. Kept apart so each player in a shared world has their own. */
export type SearchSlot = Searching;

/** The search slot now on the state. The rules change it in place, so a player's slot stays the same object. */
export function getSearchSlot(state: GameState): SearchSlot {
  return slot(state);
}

/** Put a player's search slot on the state. */
export function setSearchSlot(state: GameState, next: SearchSlot): void {
  searching.set(state, next);
}

export function emptySearchSlot(): SearchSlot {
  return { current: null, results: [] };
}

/** Let search time pass. Finishing a search turns the house's goods into things you carry. */
export function stepSearch(state: GameState, worldDt: number): void {
  const s = slot(state);
  const cur = s.current;
  if (!cur) return;
  cur.remaining -= worldDt;
  if (cur.remaining > 0) return;
  s.current = null;
  const h = houseById(cur.houseId);
  if (!h) return;
  const { goods } = lootInside(state.rngSeed, h);
  const empty = Object.keys(goods).length === 0;
  const { took, left } = pickUp(state, goods);
  state.looted[cur.houseId] = { day: Math.floor(state.worldSeconds / 86400) + 1, left };
  const result: SearchResult = { houseId: cur.houseId, name: cur.name, took, left, empty };
  s.results.push(result);
  const note = empty
    ? `The ${cur.name.toLowerCase()} had already been picked clean.`
    : `Searched the ${cur.name.toLowerCase()}: found ${describeGoods(took)}.${Object.keys(left).length ? ` No room for ${describeGoods(left)}. It stays in the house.` : ''}`;
  addMessage(state, note, 'info');
}

/** Search results that have not been shown yet. */
export function takeSearchResults(state: GameState): SearchResult[] {
  const s = slot(state);
  const out = s.results;
  s.results = [];
  return out;
}

/** Take what did not fit last time, as far as there is room now. */
export function takeLeftovers(state: GameState, houseId: string): { took: Record<string, number>; left: Record<string, number> } | null {
  const l = state.looted[houseId];
  if (!l) return null;
  const { took, left } = pickUp(state, l.left);
  l.left = left;
  return { took, left };
}

