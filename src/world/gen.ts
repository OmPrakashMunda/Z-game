import {
  city, distanceToPath, footprint, inRect, TOWN_HALF, WORLD_HALF, FOREST_KINDS,
  type Area, type BuildingDef, type Facing, type HouseType, type PropDef, type Rect,
} from '../data/city';
import { mulberry32 } from '../sim/rng';

/**
 * The world outside the hand-made town, generated from a fixed seed in square chunks. Nothing here depends on the
 * saved game, and nothing is stored: a chunk is rebuilt from its coordinates whenever it is needed, so the same
 * house stands in the same place every time and keeps the same id.
 *
 * This file has no graphics code. The renderer draws the chunks near the player and the movement code reads their
 * collision boxes.
 */

export const CHUNK = 80;
/** How many chunks there are along each side of the world. */
export const CHUNKS_PER_SIDE = (WORLD_HALF * 2) / CHUNK;
const SEED = 1337;

export interface RoadSeg {
  rect: Rect;
  kind: 'arterial' | 'collector';
}

export interface FieldDef {
  rect: Rect;
  color: number;
}

export interface ChunkData {
  cx: number;
  cz: number;
  key: string;
  /** The ground this chunk covers. */
  rect: Rect;
  roads: RoadSeg[];
  houses: BuildingDef[];
  fields: FieldDef[];
  /** Trees, bushes and rocks, including the ones in the middle of town. */
  trees: PropDef[];
}

// ---------------------------------------------------------------- Noise

function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483629) ^ Math.imul(SEED, 40503);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0 to 1. */
function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, 7);
  const b = hash(ix + 1, iz, 7);
  const c = hash(ix, iz + 1, 7);
  const d = hash(ix + 1, iz + 1, 7);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- Roads

export interface Line {
  pos: number;
  width: number;
  kind: 'arterial' | 'collector';
}

/** The same positions are used for roads running east-west and north-south. */
const LINES: Line[] = [];
for (const pos of [-600, -500, -400, -300, -200, 0, 200, 300, 400, 500, 600]) {
  const arterial = pos % 200 === 0;
  LINES.push({ pos, width: pos === 0 ? 10 : arterial ? 9 : 6, kind: arterial ? 'arterial' : 'collector' });
}

/** Where the roads run: each position is both an east-west road (at that z) and a north-south road (at that x). */
export const ROAD_LINES: readonly Line[] = LINES;

/** The two town roads that carry on past the edge of town. Inside the town the hand-made roads are used. */
const TOWN_ROAD_END = 90;

/** The deep woods around the hidden clearing: no houses, thick trees. */
export const DEEP_WOODS: Rect = { x: 165, z: -32, w: 140, d: 155 };

/** Whether (x, z) is closer than `margin` to the edge of a road. */
export function nearRoad(x: number, z: number, margin: number): boolean {
  for (const l of LINES) {
    const r = l.width / 2 + margin;
    if (Math.abs(x - l.pos) < r || Math.abs(z - l.pos) < r) return true;
  }
  return false;
}

function rectNearRoad(r: Rect, margin: number): boolean {
  for (const l of LINES) {
    const m = l.width / 2 + margin;
    if (r.x + r.w / 2 > l.pos - m && r.x - r.w / 2 < l.pos + m) return true;
    if (r.z + r.d / 2 > l.pos - m && r.z - r.d / 2 < l.pos + m) return true;
  }
  return false;
}

function nearCrossing(x: number, z: number, radius: number): boolean {
  let nx = false;
  let nz = false;
  for (const l of LINES) {
    if (Math.abs(x - l.pos) < radius) nx = true;
    if (Math.abs(z - l.pos) < radius) nz = true;
  }
  return nx && nz;
}

function roadsInChunk(cx: number, cz: number): RoadSeg[] {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const x1 = x0 + CHUNK;
  const z1 = z0 + CHUNK;
  const out: RoadSeg[] = [];
  /** Cut a span on the line's axis around the middle of town. */
  const spans = (a: number, b: number, pos: number): Array<[number, number]> => {
    if (pos !== 0) return [[a, b]];
    const parts: Array<[number, number]> = [];
    if (a < -TOWN_ROAD_END) parts.push([a, Math.min(b, -TOWN_ROAD_END)]);
    if (b > TOWN_ROAD_END) parts.push([Math.max(a, TOWN_ROAD_END), b]);
    return parts.filter(([s, e]) => e - s > 0.01);
  };
  for (const l of LINES) {
    if (l.pos + l.width / 2 > x0 && l.pos - l.width / 2 < x1) {
      for (const [a, b] of spans(z0, z1, l.pos)) out.push({ kind: l.kind, rect: { x: l.pos, z: (a + b) / 2, w: l.width, d: b - a } });
    }
    if (l.pos + l.width / 2 > z0 && l.pos - l.width / 2 < z1) {
      for (const [a, b] of spans(x0, x1, l.pos)) out.push({ kind: l.kind, rect: { x: (a + b) / 2, z: l.pos, w: b - a, d: l.width } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Areas

/** What kind of country (x, z) lies in. */
export function areaAt(x: number, z: number): Area {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d <= TOWN_HALF) return 'town';
  if (inRect(DEEP_WOODS, x, z, 0)) return 'woodland';
  const n = noise(x / 240 + 11.3, z / 240 + 4.7);
  if (d < 280) return n > 0.3 ? 'town' : 'woodland';
  if (n < 0.34) return 'woodland';
  if (n < 0.62) return 'farmland';
  return 'suburb';
}

export const AREA_NAMES: Record<Area, string> = {
  town: 'Town',
  suburb: 'Suburbs',
  farmland: 'Farmland',
  woodland: 'Woods',
};

/** How wooded the spot at (x, z) feels, from about 0.3 in the middle of town to 1 deep in the forest. Mixes the ambient sound. */
export function forestAt(x: number, z: number): number {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const out = smooth(0, 25, d - TOWN_HALF);
  const base = areaAt(x, z) === 'woodland' ? 1 : 0.55;
  return 0.3 + 0.7 * out * base;
}

// ---------------------------------------------------------------- Houses

const HOUSE_LOOK: Record<HouseType, { name: string; w: [number, number]; d: [number, number]; h: number; walls: number[]; roofs: number[] }> = {
  bungalow: { name: 'Bungalow', w: [8, 10], d: [6.5, 8], h: 3.0, walls: [0xd9c9a8, 0xc7d4c0, 0xd8b5a0, 0xe0d6b8], roofs: [0x7a3b2e, 0x5d4037, 0x4a5568] },
  family: { name: 'Family house', w: [10, 12], d: [8, 9.5], h: 3.3, walls: [0xb8c9d6, 0xcfb8c8, 0xd9c9a8, 0xc7d4c0, 0xe0d6b8], roofs: [0x4a5568, 0x7a3b2e, 0x3e4a3a] },
  villa: { name: 'Villa', w: [12, 14], d: [9, 10.5], h: 3.7, walls: [0xece3d0, 0xd8b5a0, 0xc9d3dc], roofs: [0x8a4a34, 0x3d3d46] },
  farmhouse: { name: 'Farmhouse', w: [11, 13], d: [8, 9], h: 3.4, walls: [0xe4dcc6, 0xb85c4a, 0xd2c08e], roofs: [0x5a3f33, 0x6b3a2e, 0x4a4036] },
  cabin: { name: 'Cabin', w: [6, 8], d: [5.5, 7], h: 2.7, walls: [0x8a6a48, 0x7a5c3e, 0x9a7a52], roofs: [0x3e4a3a, 0x4a3a2c, 0x2f3d33] },
};

const LOT = 24;
const DENSITY: Record<Area, number> = { town: 0.82, suburb: 0.62, farmland: 0.3, woodland: 0.2 };

function houseTypeFor(area: Area, roll: number): HouseType {
  switch (area) {
    case 'town': return roll < 0.55 ? 'bungalow' : 'family';
    case 'suburb': return roll < 0.2 ? 'bungalow' : roll < 0.7 ? 'family' : 'villa';
    case 'farmland': return roll < 0.85 ? 'farmhouse' : 'bungalow';
    case 'woodland': return roll < 0.85 ? 'cabin' : 'bungalow';
  }
}

/**
 * The house on one lot, or null if there is none. A lot is a slot beside a road: `axis` is the direction the road
 * runs ('x' runs east-west), `pos` where the road is, `k` which slot along it and `side` which side of the road.
 */
function houseAt(axis: 'x' | 'z', line: Line, k: number, side: 1 | -1): BuildingDef | null {
  const seed = Math.floor(hash(axis === 'x' ? 1 : 2, line.pos, k * 2 + (side > 0 ? 1 : 0)) * 2147483647);
  const rand = mulberry32(seed);
  const along = k * LOT + (rand() - 0.5) * 8;
  const gap = 5 + rand() * 5;
  const wRoll = rand();
  const dRoll = rand();
  const typeRoll = rand();
  const chance = rand();
  const wallRoll = rand();
  const roofRoll = rand();

  // Position of the lot's middle on the ground, before the house size is known
  const rough = axis === 'x' ? { x: along, z: line.pos + side * (line.width / 2 + gap + 5) } : { x: line.pos + side * (line.width / 2 + gap + 5), z: along };
  if (Math.abs(rough.x) > WORLD_HALF - 30 || Math.abs(rough.z) > WORLD_HALF - 30) return null;
  if (Math.max(Math.abs(rough.x), Math.abs(rough.z)) < TOWN_HALF + 16) return null;
  if (inRect(DEEP_WOODS, rough.x, rough.z, 12)) return null;
  const area = areaAt(rough.x, rough.z);
  if (chance > DENSITY[area]) return null;
  // The roads that carry on out of town are used as is. No houses right at the edge of the hand-made town on them.
  if (nearCrossing(rough.x, rough.z, axis === 'x' ? 26 : 34)) return null;

  const type = houseTypeFor(area, typeRoll);
  const look = HOUSE_LOOK[type];
  const w = Math.round((look.w[0] + (look.w[1] - look.w[0]) * wRoll) * 2) / 2;
  const d = Math.round((look.d[0] + (look.d[1] - look.d[0]) * dRoll) * 2) / 2;
  // The door faces the road: east-west roads have houses facing north or south, north-south roads east or west
  const facing: Facing = axis === 'x' ? (side > 0 ? 'N' : 'S') : side > 0 ? 'W' : 'E';
  const off = line.width / 2 + gap + d / 2;
  const x = axis === 'x' ? along : line.pos + side * off;
  const z = axis === 'x' ? line.pos + side * off : along;
  const def: BuildingDef = {
    id: `h${axis}${line.pos}_${k}_${side > 0 ? 'p' : 'm'}`,
    name: look.name, kind: 'house', houseType: type, area,
    x, z, w, d, h: look.h, facing,
    color: look.walls[Math.floor(wallRoll * look.walls.length)],
    roofColor: look.roofs[Math.floor(roofRoll * look.roofs.length)],
    accent: 0xffffff, roof: 'pitched',
  };
  // The other roads must not run through it
  if (rectNearRoad(footprint(def), 2)) return null;
  return def;
}

const houseCache = new Map<string, BuildingDef[]>();

/** The houses whose middle lies in a chunk. */
export function housesInChunk(cx: number, cz: number): BuildingDef[] {
  const key = `${cx},${cz}`;
  const hit = houseCache.get(key);
  if (hit) return hit;
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const out: BuildingDef[] = [];
  const reach = 30;
  for (const line of LINES) {
    for (const axis of ['x', 'z'] as const) {
      // Does this road come near enough for a house in the chunk to stand beside it?
      const lo = axis === 'x' ? z0 : x0;
      if (line.pos < lo - reach || line.pos > lo + CHUNK + reach) continue;
      const t0 = axis === 'x' ? x0 : z0;
      for (let k = Math.floor((t0 - 6) / LOT); k <= Math.ceil((t0 + CHUNK + 6) / LOT); k++) {
        for (const side of [1, -1] as const) {
          const h = houseAt(axis, line, k, side);
          if (!h) continue;
          if (h.x >= x0 && h.x < x0 + CHUNK && h.z >= z0 && h.z < z0 + CHUNK) out.push(h);
        }
      }
    }
  }
  houseCache.set(key, out);
  if (houseCache.size > 400) houseCache.delete(houseCache.keys().next().value as string);
  return out;
}

/** Find a house again from its id (for example to look inside it). */
export function houseById(id: string): BuildingDef | null {
  const m = /^h([xz])(-?\d+)_(-?\d+)_([pm])$/.exec(id);
  if (!m) return null;
  const line = LINES.find((l) => l.pos === Number(m[2]));
  if (!line) return null;
  return houseAt(m[1] as 'x' | 'z', line, Number(m[3]), m[4] === 'p' ? 1 : -1);
}

/** Every house in the chunks next to this one too, so nothing is planted through a neighbour's wall. */
function nearbyHouses(cx: number, cz: number): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) out.push(...housesInChunk(cx + dx, cz + dz));
  }
  return out;
}

// ---------------------------------------------------------------- Chunks

const FIELD_COLORS = [0x9a8a46, 0x79933f, 0x7a5a38, 0xa89850, 0x6b8a3a];
const TREE_STEP = 4.4;

const TOWN_TREES = new Map<string, PropDef[]>();
for (const p of city.props) {
  if (!FOREST_KINDS.includes(p.kind)) continue;
  const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
  const list = TOWN_TREES.get(key);
  if (list) list.push(p);
  else TOWN_TREES.set(key, [p]);
}

const woodsPlot = city.plots.find((p) => p.id === 'woods')!.bounds;
const dirtRoad = city.dirtRoads[0];

/** Whether a tree may stand here: not on a road, in a yard, on a field or on the plots. */
function treeSpotFree(x: number, z: number, houses: BuildingDef[], fields: FieldDef[]): boolean {
  if (nearRoad(x, z, 3)) return false;
  if (x > 80 && x < 155 && z > -45 && z < 15 && distanceToPath(dirtRoad.path, x, z) < dirtRoad.width / 2 + 2.8) return false;
  if (inRect(woodsPlot, x, z, 3.5)) return false;
  for (const f of fields) if (inRect(f.rect, x, z, 1.5)) return false;
  for (const h of houses) if (inRect(footprint(h), x, z, 3)) return false;
  return true;
}

function makeChunk(cx: number, cz: number): ChunkData {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const rect: Rect = { x: x0 + CHUNK / 2, z: z0 + CHUNK / 2, w: CHUNK, d: CHUNK };
  const roads = roadsInChunk(cx, cz);
  const houses = housesInChunk(cx, cz);
  const near = nearbyHouses(cx, cz);
  const fields: FieldDef[] = [];

  // Farmland gets a few fields on the open ground between roads and houses
  if (areaAt(rect.x, rect.z) === 'farmland' && Math.max(Math.abs(rect.x), Math.abs(rect.z)) > TOWN_HALF + 40) {
    const rand = mulberry32(Math.floor(hash(cx, cz, 91) * 2147483647));
    for (let tries = 0; tries < 8 && fields.length < 3; tries++) {
      const w = 26 + Math.floor(rand() * 26);
      const d = 20 + Math.floor(rand() * 22);
      const f: Rect = { x: x0 + 4 + w / 2 + rand() * (CHUNK - 8 - w), z: z0 + 4 + d / 2 + rand() * (CHUNK - 8 - d), w, d };
      if (rectNearRoad(f, 3)) continue;
      if (near.some((h) => rectsTouch(f, footprint(h), 4))) continue;
      if (fields.some((o) => rectsTouch(f, o.rect, 3))) continue;
      if (rand() < 0.25) continue;
      fields.push({ rect: f, color: FIELD_COLORS[Math.floor(rand() * FIELD_COLORS.length)] });
    }
  }

  const trees: PropDef[] = [...(TOWN_TREES.get(`${cx},${cz}`) ?? [])];
  const gx0 = Math.ceil(x0 / TREE_STEP);
  const gx1 = Math.ceil((x0 + CHUNK) / TREE_STEP);
  const gz0 = Math.ceil(z0 / TREE_STEP);
  const gz1 = Math.ceil((z0 + CHUNK) / TREE_STEP);
  for (let gx = gx0; gx < gx1; gx++) {
    for (let gz = gz0; gz < gz1; gz++) {
      const x = gx * TREE_STEP + (hash(gx, gz, 1) - 0.5) * 3.4;
      const z = gz * TREE_STEP + (hash(gx, gz, 2) - 0.5) * 3.4;
      if (x < x0 || x >= x0 + CHUNK || z < z0 || z >= z0 + CHUNK) continue;
      if (Math.abs(x) > WORLD_HALF - 2 || Math.abs(z) > WORLD_HALF - 2) continue;
      const outside = Math.max(Math.abs(x), Math.abs(z)) - TOWN_HALF; // 0 at the town edge
      if (outside <= 0) continue; // the town has its own trees
      const deep = inRect(DEEP_WOODS, x, z, 0);
      const area = areaAt(x, z);
      const density = deep ? 0.9 : area === 'woodland' ? 0.88 : area === 'suburb' ? 0.22 : area === 'town' ? 0.3 : 0.07;
      if (hash(gx, gz, 4) > density * smooth(0, 14, outside)) continue;
      if (!treeSpotFree(x, z, near, fields)) continue;
      const roll = hash(gx, gz, 3);
      const rot = hash(gx, gz, 5) * Math.PI * 2;
      const variant = Math.floor(hash(gx, gz, 6) * 3);
      if (roll < 0.62) trees.push({ kind: 'tree', x, z, rot, variant });
      else if (roll < 0.86) trees.push({ kind: 'oak', x, z, rot, variant });
      else if (roll < 0.96) trees.push({ kind: 'bush', x, z, rot, variant: variant % 2 });
      else trees.push({ kind: 'rock', x, z, rot, variant });
    }
  }
  return { cx, cz, key: `${cx},${cz}`, rect, roads, houses, fields, trees };
}

function rectsTouch(a: Rect, b: Rect, margin: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + margin && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + margin;
}

const chunkCache = new Map<string, ChunkData>();

export function inWorldChunk(cx: number, cz: number): boolean {
  const half = CHUNKS_PER_SIDE / 2;
  return cx >= -half && cx < half && cz >= -half && cz < half;
}

/** Make (or fetch) the chunk with these coordinates. Chunk (0, 0) covers x and z from 0 to 80. */
export function getChunk(cx: number, cz: number): ChunkData {
  const key = `${cx},${cz}`;
  const hit = chunkCache.get(key);
  if (hit) {
    // Keep the most recently used last, so the oldest is dropped first
    chunkCache.delete(key);
    chunkCache.set(key, hit);
    return hit;
  }
  const made = makeChunk(cx, cz);
  chunkCache.set(key, made);
  if (chunkCache.size > 90) chunkCache.delete(chunkCache.keys().next().value as string);
  return made;
}

export function chunkCoord(v: number): number {
  return Math.floor(v / CHUNK);
}
