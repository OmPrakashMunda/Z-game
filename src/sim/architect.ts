import { balance } from '../data/balance';
import { city, distanceToPath, type Rect } from '../data/city';
import { ONLINE_STORE_ID } from '../data/stores';
import { footprint, gridRectOf, STRUCTURES } from '../data/structures';
import { MEALS_PER_ITEM, SURVIVAL, UTILITIES, WATER_PER_ITEM } from '../data/survival';
import { DIRTY_ABOVE, WORN_BELOW, upkeepOf } from '../data/upkeep';
import { itemById } from '../data/items';
import { gridOf, occupiedCells, occupiedEdges, placePiece, placementProblem, type Grid } from './build';
import { worldSecondsAt } from './clock';
import { itemPrice, placeOrder, quote, stockOf } from './economy';
import { expandPlot, expansionPrice, expansionProblem, ownedRect, plotOf, type Side as LandSide } from './land';
import type { GameState, Piece } from './state';
import { stepSim } from './step';
import { flushSurvival, summarize } from './survival';
import { buildTopology, gapBetween, runtimeOf, type UNode } from './utilities';

/**
 * The Base Architect. It reads the base you have, says what is missing, and designs an upgrade around what is already
 * standing: crops in the outer belt, living quarters and utilities in a protected core, a wall with a gate and watch
 * posts around it all. Nothing here changes the game until `buildPlan` is called.
 */

/** The plan is sized for this many people, twice the family you start with. */
export const TARGET_PEOPLE = 8;
const CABINS_TO_ADD = 2;
/** A plot too small for the full design is grown to at least this many cells (2 m each) before the design is made. */
const PREFERRED_COLS = 22;
const PREFERRED_ROWS = 18;
/** Sleeping places per structure, from the shop descriptions. */
const BEDS: Record<string, number> = { tent_large: 4, prefab_home: 4, cabin_small: 2, house_family: 6, house_large: 10, bunker: 6, bunk_beds: 4 };
const SEED_CYCLES = 8;
const FEED_CYCLES = 10;
const BARRIER_TYPES = /^(fence_|wall_|gate_|container_)|^sandbag_wall$/;

export type Group = 'water' | 'food' | 'power' | 'housing' | 'security' | 'access' | 'land' | 'upkeep';
export const GROUP_LABEL: Record<Group, string> = {
  water: 'Water', food: 'Food', power: 'Power', housing: 'Housing', security: 'Security', access: 'Paths', land: 'Land', upkeep: 'Upkeep',
};

export interface Finding {
  id: string;
  icon: string;
  status: 'good' | 'warn' | 'bad';
  title: string;
  detail: string;
}

export interface PlanPiece {
  type: string;
  cx: number;
  cz: number;
  rot: number;
  group: Group;
  rank: number;
}

export interface PlanLine {
  type: string;
  name: string;
  group: Group;
  /** How many the plan places. */
  qty: number;
  /** How many have to be bought (the rest are in storage already). */
  buy: number;
  unit: number;
  total: number;
}

export interface PlanOutcome {
  people: number;
  mealsMake: number;
  mealsNeed: number;
  waterMake: number;
  waterNeed: number;
  waterStoreL: number;
  batteryKwh: number;
  problems: string[];
  ok: boolean;
}

export interface BasePlan {
  pieces: PlanPiece[];
  /** What to order from the online store. */
  buy: Record<string, number>;
  lines: PlanLine[];
  cost: number;
  shortfall: number;
  notes: string[];
  crewHours: number;
  gateSide: string;
  /** Strips of land the plan buys first, so that everything fits. */
  land: { sides: LandSide[]; cost: number };
  outcome: PlanOutcome;
}

type Side = 'N' | 'E' | 'S' | 'W';
const SIDES: Side[] = ['N', 'E', 'S', 'W'];

// ---------------------------------------------------------------- Reading the base

function countType(pieces: Piece[], type: string): number {
  let n = 0;
  for (const p of pieces) if (p.type === type) n++;
  return n;
}

function boundarySegments(grid: Grid): string[] {
  const keys: string[] = [];
  for (let x = grid.minCx; x < grid.maxCx; x++) keys.push(`h:${x},${grid.minCz}`, `h:${x},${grid.maxCz}`);
  for (let z = grid.minCz; z < grid.maxCz; z++) keys.push(`v:${grid.minCx},${z}`, `v:${grid.maxCx},${z}`);
  return keys;
}

/** Plain-language findings about the base as it stands. */
export function analyseBase(state: GameState): Finding[] {
  const out: Finding[] = [];
  const grid = gridOf(state);
  if (!grid) return out;
  const s = summarize(state);
  const done = state.pieces.filter((p) => p.progress >= 1);
  const planned = state.pieces.length - done.length;

  const beds = done.reduce((n, p) => n + (BEDS[p.type] ?? 0), 0);
  out.push({
    id: 'beds', icon: 'Bed',
    status: beds >= TARGET_PEOPLE ? 'good' : beds >= SURVIVAL.people ? 'warn' : 'bad',
    title: `Beds for ${beds}`,
    detail: beds >= TARGET_PEOPLE ? `Enough for ${TARGET_PEOPLE} people.` : `Room for ${beds}. To house ${TARGET_PEOPLE}, add cabins.`,
  });

  const mealsNeed = TARGET_PEOPLE * SURVIVAL.mealsPerPersonDay;
  const food = s.food.makePerDay;
  out.push({
    id: 'food', icon: 'Wheat',
    status: food >= mealsNeed ? 'good' : food >= s.food.perDay ? 'warn' : 'bad',
    title: `Food: ${Math.round(food)} meals a day`,
    detail: food >= mealsNeed
      ? `Your farms feed ${TARGET_PEOPLE} people.`
      : `${TARGET_PEOPLE} people eat ${mealsNeed} a day. ${s.counts.workingFarms} of ${s.counts.farms} farms are working.`,
  });

  const waterNeed = TARGET_PEOPLE * SURVIVAL.waterPerPersonDay;
  const water = s.water.makePerDay;
  out.push({
    id: 'water', icon: 'Droplet',
    status: water >= waterNeed * 2 ? 'good' : water >= s.water.perDay ? 'warn' : 'bad',
    title: `Water: ${Math.round(water)} L a day`,
    detail: `${s.counts.cleanWaterSources} clean source${s.counts.cleanWaterSources === 1 ? '' : 's'}, tanks hold ${Math.round(s.water.capacity)} L. Crops drink from the same supply.`,
  });

  out.push({
    id: 'power', icon: 'Zap',
    status: s.power.hasSource && s.power.capacityKwh >= 12 ? 'good' : s.power.hasSource ? 'warn' : s.counts.powerConsumers > 0 ? 'bad' : 'warn',
    title: s.power.hasSource ? `Power: ${s.power.capacityKwh} kWh of battery` : 'No power source',
    detail: s.power.hasSource
      ? 'Lights, pumps and the medical station can run at night.'
      : 'Lights, pumps and electric fences need solar panels, wind or a generator.',
  });

  const boundary = boundarySegments(grid);
  const edges = occupiedEdges(state.pieces);
  let covered = 0;
  for (const key of boundary) if (edges.has(key)) covered++;
  const share = boundary.length ? covered / boundary.length : 0;
  out.push({
    id: 'wall', icon: 'Fence',
    status: share >= 0.95 ? 'good' : share >= 0.4 ? 'warn' : 'bad',
    title: `Outer wall: ${Math.round(share * 100)}% closed`,
    detail: share >= 0.95
      ? 'Your land is fully enclosed.'
      : `${boundary.length - covered} of ${boundary.length} sections on the boundary are open.`,
  });

  const towers = countType(done, 'watchtower');
  const lights = countType(done, 'floodlight_tower');
  out.push({
    id: 'watch', icon: 'Binoculars',
    status: towers >= 2 && lights >= 2 ? 'good' : towers + lights > 0 ? 'warn' : 'bad',
    title: `${towers} watchtower${towers === 1 ? '' : 's'}, ${lights} floodlight${lights === 1 ? '' : 's'}`,
    detail: towers >= 2 && lights >= 2 ? 'The perimeter is watched and lit.' : 'Watch posts and lights show threats early. A dark wall is a blind wall.',
  });

  const seedFarms = done.filter((p) => UTILITIES[p.type]?.farm?.seeds);
  if (seedFarms.length > 0) {
    const perCycle = seedFarms.reduce((n, p) => n + UTILITIES[p.type].farm!.seeds!.qty, 0);
    const days = ((state.storage.seeds_veg ?? 0) / perCycle) * 5;
    out.push({
      id: 'seeds', icon: 'Sprout',
      status: days >= 40 ? 'good' : days >= 10 ? 'warn' : 'bad',
      title: `Seeds for ${Math.floor(days)} days`,
      detail: 'Vegetable beds use seeds every cycle. Orchards and fish ponds need none, so they keep the base fed once the shops close.',
    });
  }

  const care = done.filter((p) => upkeepOf(p.type));
  const worn = care.filter((p) => p.hp / p.maxHp < WORN_BELOW).length;
  const dirty = care.filter((p) => upkeepOf(p.type)?.dirtDays && (p.dirt ?? 0) > DIRTY_ABOVE).length;
  const tools = ['toolbox', 'shovel', 'power_tools', 'welding_kit'].filter((t) => (state.storage[t] ?? 0) < 1);
  out.push({
    id: 'upkeep', icon: 'Wrench',
    status: worn + dirty > 0 ? 'bad' : tools.length > 0 ? 'warn' : 'good',
    title: worn + dirty > 0 ? `${worn} worn, ${dirty} dirty` : 'Everything is in good shape',
    detail: worn + dirty > 0
      ? 'Click a structure to repair or clean it.'
      : tools.length > 0 ? 'Things wear out over time. Keep a toolbox, shovel, power tools and a welding kit in storage.' : 'Your tools are in storage for when it is needed.',
  });

  if (planned > 0) {
    out.push({ id: 'queue', icon: 'Hammer', status: 'warn', title: `${planned} piece${planned === 1 ? '' : 's'} still being built`, detail: 'The crew works on the oldest plans first.' });
  }
  return out;
}

// ---------------------------------------------------------------- Layout engine

function distToRect(r: Rect, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - r.x) - r.w / 2);
  const dz = Math.max(0, Math.abs(z - r.z) - r.d / 2);
  return Math.hypot(dx, dz);
}

/** The side of the land that faces the nearest road: the gate goes there. */
function gateSideFor(state: GameState): Side {
  const plot = plotOf(state);
  if (!plot) return 'S';
  const r = ownedRect(plot, state.expansion);
  const probes: Record<Side, [number, number]> = {
    N: [r.x, r.z - r.d / 2 - 3], S: [r.x, r.z + r.d / 2 + 3], W: [r.x - r.w / 2 - 3, r.z], E: [r.x + r.w / 2 + 3, r.z],
  };
  let best: Side = 'S';
  let bestD = Infinity;
  for (const side of SIDES) {
    const [x, z] = probes[side];
    let d = Infinity;
    for (const road of city.roads) d = Math.min(d, distToRect(road, x, z));
    for (const dirt of city.dirtRoads) d = Math.min(d, Math.max(0, distanceToPath(dirt.path, x, z) - dirt.width / 2));
    if (d < bestD) {
      bestD = d;
      best = side;
    }
  }
  return best;
}

interface Frame {
  lane0: [number, number];
  along: [number, number];
  inward: [number, number];
}

type Cell = [number, number];

class Layout {
  readonly scratch: GameState;
  readonly grid: Grid;
  readonly planned: PlanPiece[] = [];
  private occupied: Map<string, Piece>;
  private readonly made = new Map<string, number>();
  private readonly limits = new Map<string, number>();

  constructor(private readonly state: GameState) {
    this.scratch = structuredClone(state);
    this.scratch.at = 'base';
    this.grid = gridOf(this.scratch)!;
    this.occupied = occupiedCells(this.scratch.pieces);
  }

  /** How many of a structure the plan may place: what is in storage plus what the online shelf holds. */
  limit(type: string): number {
    let v = this.limits.get(type);
    if (v === undefined) {
      v = (this.state.storage[type] ?? 0) + stockOf(this.state, ONLINE_STORE_ID, type);
      this.limits.set(type, v);
    }
    return v;
  }

  count(type: string): number {
    return this.made.get(type) ?? 0;
  }

  valid(type: string, cx: number, cz: number, rot: number): boolean {
    this.scratch.storage[type] = 999;
    return placementProblem(this.scratch, type, cx, cz, rot, this.occupied) === null;
  }

  can(type: string, cx: number, cz: number, rot: number): boolean {
    return this.count(type) < this.limit(type) && this.valid(type, cx, cz, rot);
  }

  put(type: string, cx: number, cz: number, rot: number, group: Group, rank: number): boolean {
    if (!this.can(type, cx, cz, rot)) return false;
    const r = placePiece(this.scratch, type, cx, cz, rot);
    if (!r.ok) return false;
    r.piece.progress = 1;
    this.planned.push({ type, cx, cz, rot, group, rank });
    this.made.set(type, this.count(type) + 1);
    this.occupied = occupiedCells(this.scratch.pieces);
    return true;
  }

  /** Put a piece that exactly covers these cells (a one-cell piece, or a 2 x 1 piece lying along them). */
  putCells(type: string, cells: Cell[], group: Group, rank: number): boolean {
    const x = Math.min(...cells.map((c) => c[0]));
    const z = Math.min(...cells.map((c) => c[1]));
    const rot = cells.length > 1 && cells.every((c) => c[1] === cells[0][1]) ? 0 : cells.length > 1 ? 1 : 0;
    return this.put(type, x, z, rot, group, rank);
  }

  /** The best free spot for a piece: smallest score wins. Returns false when nothing fits. */
  place(
    type: string, group: Group, rank: number, score: (cx: number, cz: number, w: number, d: number) => number,
    zone: (cx: number, cz: number, w: number, d: number) => boolean = () => true,
  ): boolean {
    const def = STRUCTURES[type];
    let best: { cx: number; cz: number; rot: number } | null = null;
    let bestScore = Infinity;
    const g = this.grid;
    for (let cx = g.minCx; cx < g.maxCx; cx++) {
      for (let cz = g.minCz; cz < g.maxCz; cz++) {
        for (const rot of [0, 1]) {
          const fp = footprint(def, rot);
          if (cx + fp.w > g.maxCx || cz + fp.d > g.maxCz) continue;
          if (!zone(cx, cz, fp.w, fp.d)) continue;
          if (!this.can(type, cx, cz, rot)) continue;
          const s = score(cx, cz, fp.w, fp.d);
          if (s < bestScore - 1e-9) {
            bestScore = s;
            best = { cx, cz, rot };
          }
        }
        if (this.count(type) >= this.limit(type)) return false;
      }
    }
    return best ? this.put(type, best.cx, best.cz, best.rot, group, rank) : false;
  }
}

const RANK = { water: 10, pipe: 15, food: 20, power: 30, pole: 35, housing: 40, outer: 50, gate: 52, watch: 60, inner: 70, access: 80 };

interface Config {
  /** Extra power on top of the estimate, for the retry loop. */
  powerBump: number;
  /** Leave out floodlights and the medical station (for plots with no room for power). */
  noLights?: boolean;
}

interface Built {
  layout: Layout;
  notes: string[];
  gateSide: Side;
  seedsNeeded: number;
  feedNeeded: number;
  edgeTypes: { outer: string; inner: string | null; gate: string; innerGate: string };
}

function layoutPlan(state: GameState, cfg: Config): Built {
  const L = new Layout(state);
  const notes: string[] = [];
  const g = L.grid;
  const [X0, X1, Z0, Z1] = [g.minCx, g.maxCx, g.minCz, g.maxCz];
  const cols = X1 - X0;
  const rows = Z1 - Z0;
  const compact = !(cols - 6 >= 8 && rows - 6 >= 6);
  const D = compact ? 0 : 3;
  const dist = (x: number, z: number) => Math.min(x - X0, X1 - 1 - x, z - Z0, Z1 - 1 - z);
  const allCells = (cx: number, cz: number, w: number, d: number, test: (x: number, z: number) => boolean) => {
    for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) if (!test(x, z)) return false;
    return true;
  };
  const inRing = (cx: number, cz: number, w: number, d: number) => D === 0 || allCells(cx, cz, w, d, (x, z) => dist(x, z) < D);
  const inCore = (cx: number, cz: number, w: number, d: number) => D === 0 || allCells(cx, cz, w, d, (x, z) => dist(x, z) >= D);
  const edgeDist = (cx: number, cz: number, w: number, d: number) => {
    let m = Infinity;
    for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) m = Math.min(m, dist(x, z));
    return m;
  };
  const toward = (ax: number, az: number) => (cx: number, cz: number, w: number, d: number) =>
    Math.hypot(cx + w / 2 - ax, cz + d / 2 - az);

  // ---- The gate faces the road
  const gateSide = gateSideFor(state);
  const sideLen = (s: Side) => (s === 'N' || s === 'S' ? cols : rows);
  const gateAtIdx = (g: number, inset: number): [number, number, number] => {
    if (gateSide === 'N') return [X0 + g, Z0 + inset, 0];
    if (gateSide === 'S') return [X0 + g, Z1 - inset, 0];
    if (gateSide === 'W') return [X0 + inset, Z0 + g, 1];
    return [X1 - inset, Z0 + g, 1];
  };
  // Start in the middle of the side and move along it until the gate's spot is free (existing fences may be in the way)
  const gateExists = (pos: [number, number, number]) =>
    state.pieces.some((x) => x.type.startsWith('gate_') && x.cx === pos[0] && x.cz === pos[1] && x.rot % 2 === pos[2]);
  const midIdx = Math.floor(sideLen(gateSide) / 2) - 1;
  let gIdx = midIdx;
  for (let off = 0; off <= midIdx - 3; off++) {
    const tries = off === 0 ? [midIdx] : [midIdx + off, midIdx - off];
    const hit = tries.find((g) => {
      const o = gateAtIdx(g, 0);
      const i = gateAtIdx(g, D);
      return (gateExists(o) || L.valid('gate_steel', o[0], o[1], o[2])) && (D === 0 || gateExists(i) || L.valid('gate_chain', i[0], i[1], i[2]));
    });
    if (hit !== undefined) {
      gIdx = hit;
      break;
    }
  }
  const frame: Frame = {
    N: { lane0: [X0 + gIdx, Z0], along: [1, 0], inward: [0, 1] },
    S: { lane0: [X0 + gIdx, Z1 - 1], along: [1, 0], inward: [0, -1] },
    W: { lane0: [X0, Z0 + gIdx], along: [0, 1], inward: [1, 0] },
    E: { lane0: [X1 - 1, Z0 + gIdx], along: [0, 1], inward: [-1, 0] },
  }[gateSide] as Frame;
  const cellAt = (a: number, k: number): Cell => [
    frame.lane0[0] + frame.along[0] * a + frame.inward[0] * k,
    frame.lane0[1] + frame.along[1] * a + frame.inward[1] * k,
  ];
  const need = (type: string, target: number) => Math.max(0, target - countType(state.pieces, type));

  // ---- Core geometry and anchors (cells; fractions run -0.5..0.5 across the core)
  const cx0 = X0 + D;
  const cx1 = X1 - D;
  const cz0 = Z0 + D;
  const cz1 = Z1 - D;
  const ctrX = (cx0 + cx1) / 2;
  const ctrZ = (cz0 + cz1) / 2;
  const lenAlong = Math.abs(frame.along[0]) * (cx1 - cx0) + Math.abs(frame.along[1]) * (cz1 - cz0);
  const lenIn = Math.abs(frame.inward[0]) * (cx1 - cx0) + Math.abs(frame.inward[1]) * (cz1 - cz0);
  const anchor = (a: number, k: number): [number, number] => [
    ctrX + frame.along[0] * a * lenAlong + frame.inward[0] * k * lenIn,
    ctrZ + frame.along[1] * a * lenAlong + frame.inward[1] * k * lenIn,
  ];

  // ---- 1. The road in: a stone path from the gate through the belt to the core
  const laneDepth = compact ? 3 : D + 1;
  for (let k = 0; k < laneDepth; k++) {
    for (let a = 0; a < 2; a++) L.putCells('path_stone', [cellAt(a, k)], 'access', RANK.access);
  }

  // ---- 2. Watch posts at the corners, floodlights in a pinwheel along the wall
  const corners: Cell[] = [[X0, Z0], [X1 - 1, Z0], [X0, Z1 - 1], [X1 - 1, Z1 - 1]];
  for (let i = need('watchtower', 4); i > 0; i--) {
    const c = corners.shift();
    if (!c) break;
    if (!L.putCells('watchtower', [c], 'security', RANK.watch)) L.place('watchtower', 'security', RANK.watch, toward(c[0], c[1]));
  }
  const q = (n: number, len: number) => Math.round(len * n);
  const lights: Cell[] = [
    [X0 + q(0.25, cols), Z0], [X1 - 1, Z0 + q(0.25, rows)], [X0 + q(0.75, cols), Z1 - 1], [X0, Z0 + q(0.75, rows)],
  ];
  for (let i = cfg.noLights ? 0 : need('floodlight_tower', 4); i > 0; i--) {
    const c = lights.shift();
    if (!c) break;
    if (!L.putCells('floodlight_tower', [c], 'security', RANK.watch)) L.place('floodlight_tower', 'security', RANK.watch, toward(c[0], c[1]));
  }

  // ---- 3. Gun nests and spikes beside the gate road
  const nests: Cell[][] = [[cellAt(-2, 0), cellAt(-1, 0)], [cellAt(2, 0), cellAt(3, 0)]];
  for (let i = need('sandbag_nest', 2); i > 0; i--) {
    const cells = nests.shift();
    if (!cells) break;
    if (!L.putCells('sandbag_nest', cells, 'security', RANK.watch)) {
      const mid = cells[0];
      L.place('sandbag_nest', 'security', RANK.watch, toward(mid[0], mid[1]), inRing);
    }
  }
  const spikes: Cell[] = [cellAt(-1, 1), cellAt(2, 1), cellAt(-1, 2), cellAt(2, 2)];
  for (let i = need('spike_strip', 4); i > 0; i--) {
    const c = spikes.shift();
    if (!c) break;
    L.putCells('spike_strip', [c], 'security', RANK.watch);
  }

  // ---- 4. Housing: two more cabins at the back of the core, away from the gate
  for (let i = 0; i < CABINS_TO_ADD; i++) {
    const [ax, az] = anchor(i === 0 ? -0.27 : 0.27, 0.25);
    if (!L.place('cabin_small', 'housing', RANK.housing, toward(ax, az), inCore)) {
      notes.push('There was no room for another cabin. Buy more land and plan again.');
    }
  }
  {
    const [ax, az] = anchor(0, 0.4);
    if (!cfg.noLights && need('medical_station', 1) > 0) L.place('medical_station', 'housing', RANK.housing, toward(ax, az), inCore);
  }
  // Two cabins sleep four. Add bunk beds until there are beds for everyone the plan is sized for
  {
    const beds = () => L.scratch.pieces.reduce((n, p) => n + (BEDS[p.type] ?? 0), 0);
    const [ax, az] = anchor(0, 0.3);
    while (beds() < TARGET_PEOPLE && L.count('bunk_beds') < 3) {
      if (!L.place('bunk_beds', 'housing', RANK.housing, toward(ax, az), inCore)) break;
    }
  }

  // ---- 5. Fish pond in the core (food that needs no seeds), then the water works
  const pond = () => {
    const [ax, az] = anchor(0.28, -0.12);
    if (need('pond_fish', 1) > 0 && !L.place('pond_fish', 'food', RANK.food, toward(ax, az), inCore)) {
      notes.push('There was no room for a fish pond.');
    }
  };
  if (!compact) pond();

  const [wx, wz] = anchor(-0.3, -0.22);
  const water: Array<[string, number]> = [['well_hand', 2], ['water_tank', 2], ['water_tower', 1]];
  for (const [type, target] of water) {
    for (let i = need(type, target); i > 0; i--) {
      if (!L.place(type, 'water', RANK.water, toward(wx, wz), inCore)) {
        notes.push(`There was no room for a ${STRUCTURES[type].name.toLowerCase()}.`);
        break;
      }
    }
  }

  // ---- 6. Crops in the outer belt: orchards need nothing but water, so they keep the base fed for good
  const gateIdx = SIDES.indexOf(gateSide);
  const sideOf = (offset: number): Side => SIDES[(gateIdx + offset) % 4];
  const ringAnchor = (side: Side, frac: number, depth = 1.5): [number, number] => {
    if (side === 'N') return [X0 + frac * cols, Z0 + depth];
    if (side === 'S') return [X0 + frac * cols, Z1 - depth];
    if (side === 'W') return [X0 + depth, Z0 + frac * rows];
    return [X1 - depth, Z0 + frac * rows];
  };
  const farmScore = (ax: number, az: number) => (cx: number, cz: number, w: number, d: number) =>
    toward(ax, az)(cx, cz, w, d) + (compact ? 4 * edgeDist(cx, cz, w, d) : 0);
  const farmSpots: Array<[Side, number]> = [[sideOf(2), 0.22], [sideOf(2), 0.78], [sideOf(1), 0.5], [sideOf(3), 0.5], [sideOf(1), 0.2], [sideOf(3), 0.8]];
  let spot = 0;
  const nextSpot = (): [number, number] => {
    const [s, f] = farmSpots[spot % farmSpots.length];
    spot++;
    return ringAnchor(s, f);
  };
  const farmTargets: Array<[string, number]> = [['orchard_plot', 3], ['greenhouse_large', 1]];
  for (const [type, target] of farmTargets) {
    for (let i = need(type, target); i > 0; i--) {
      const [ax, az] = nextSpot();
      if (!L.place(type, 'food', RANK.food, farmScore(ax, az), inRing)) {
        notes.push(`There was no room for a ${STRUCTURES[type].name.toLowerCase()} in the outer belt.`);
        break;
      }
    }
  }
  if (compact) pond();

  // Top up to the food target if the belt could not hold the usual set (small plots)
  const foodRate = () => {
    let r = 0;
    for (const p of L.scratch.pieces) {
      const f = UTILITIES[p.type]?.farm;
      if (f && p.progress >= 1) r += f.meals / f.days;
    }
    return r;
  };
  const foodGoal = TARGET_PEOPLE * SURVIVAL.mealsPerPersonDay * 1.15;
  const topUp: Array<[string, number]> = [['greenhouse_large', 2], ['greenhouse_kit', 3], ['garden_bed', 8]];
  for (const [type, cap] of topUp) {
    while (foodRate() < foodGoal && L.count(type) + countType(state.pieces, type) < cap) {
      const [ax, az] = nextSpot();
      if (!L.place(type, 'food', RANK.food, farmScore(ax, az), inRing)) break;
    }
  }
  if (foodRate() < foodGoal) notes.push(`The farms will make ${Math.round(foodRate())} meals a day, short of the ${Math.round(foodGoal)} that ${TARGET_PEOPLE} people need. More land would fix that.`);
  for (let i = need('scarecrow', 2); i > 0; i--) {
    const [ax, az] = nextSpot();
    L.place('scarecrow', 'food', RANK.food, farmScore(ax, az), inRing);
  }

  // ---- 7. Power: solar arrays and batteries sized to the lights, pumps and medical station
  {
    let always = 0;
    let dark = 0;
    let makeKwh = 0;
    let storeKwh = 0;
    for (const p of L.scratch.pieces) {
      const pw = UTILITIES[p.type]?.power;
      if (!pw) continue;
      if (pw.useKw) {
        if (pw.darkOnly) dark += pw.useKw;
        else always += pw.useKw;
      }
      if (pw.makeKw) makeKwh += pw.makeKw * (pw.source === 'sun' ? 6 : pw.source === 'wind' ? 7 : 0);
      if (pw.storeKwh) storeKwh += pw.storeKwh;
    }
    const dayNeed = always * 24 + dark * 11;
    const nightNeed = always * 13 + dark * 11;
    let arrays = Math.max(0, Math.ceil((dayNeed * 1.5 - makeKwh) / (2.1 * 6)));
    let banks = Math.max(0, Math.ceil((nightNeed * 1.3 - storeKwh) / 12));
    if (dayNeed > 0) {
      arrays = Math.max(arrays, makeKwh > 0 ? 0 : 1) + cfg.powerBump;
      banks = Math.max(banks, storeKwh > 0 ? 0 : 1) + cfg.powerBump;
    }
    const [px, pz] = anchor(0.12, -0.38);
    for (let i = Math.min(arrays, 6); i > 0; i--) {
      if (L.place('solar_array', 'power', RANK.power, toward(px, pz), inCore)) continue;
      // No room for a 2 x 2 array: fall back to single panels, six to an array
      let any = false;
      for (let j = 0; j < 6 && L.place('solar_panel', 'power', RANK.power, toward(px, pz), inCore); j++) any = true;
      if (!any) notes.push('There was no room for more solar power.');
      break;
    }
    const charging = L.scratch.pieces.some((x) => {
      const pw = UTILITIES[x.type]?.power;
      return !!pw?.makeKw && pw.source !== 'fuel';
    });
    for (let i = Math.min(banks, 6); i > 0 && (charging || banks === 0); i--) {
      if (!L.place('battery_bank', 'power', RANK.power, toward(px, pz), inCore)) {
        notes.push('There was no room for another battery.');
        break;
      }
    }
  }

  // ---- 8. Join everything up with pipe junctions and power poles
  linkUp(L, notes, inRing);

  // ---- 9. Walls, gates and the inner ring
  const free = (type: string, cx: number, cz: number, rot: number) => L.valid(type, cx, cz, rot);
  const outerSegs: Array<[number, number, number]> = [];
  const innerSegs: Array<[number, number, number]> = [];
  const ring = (x0: number, x1: number, z0: number, z1: number, into: Array<[number, number, number]>) => {
    for (let x = x0; x < x1; x++) into.push([x, z0, 0], [x, z1, 0]);
    for (let z = z0; z < z1; z++) into.push([x0, z, 1], [x1, z, 1]);
  };
  ring(X0, X1, Z0, Z1, outerSegs);
  const hasInner = D > 0;
  if (hasInner) ring(X0 + D, X1 - D, Z0 + D, Z1 - D, innerSegs);

  const gateAt = (inset: number) => gateAtIdx(gIdx, inset);
  const coversGate = (seg: [number, number, number], gate: [number, number, number]) => {
    if (seg[2] !== gate[2]) return false;
    if (gate[2] === 0) return seg[1] === gate[1] && seg[0] >= gate[0] && seg[0] < gate[0] + 2;
    return seg[0] === gate[0] && seg[1] >= gate[1] && seg[1] < gate[1] + 2;
  };
  const outerGate = gateAt(0);
  const innerGate = gateAt(D);
  const outerList = outerSegs.filter((s) => !coversGate(s, outerGate) && free('fence_chain', s[0], s[1], s[2]));
  const innerList = hasInner ? innerSegs.filter((s) => !coversGate(s, innerGate) && free('fence_chain', s[0], s[1], s[2])) : [];

  const shelf = (type: string) => (state.storage[type] ?? 0) + stockOf(state, ONLINE_STORE_ID, type);
  const price = (type: string) => itemPrice(ONLINE_STORE_ID, type, state.worldSeconds);
  const buyCost = (type: string, qty: number) => Math.max(0, qty - (state.storage[type] ?? 0)) * price(type);
  const baseCart = cartOf(L, state, 0, 0);
  const baseCost = quote(state, ONLINE_STORE_ID, baseCart.cart).total;
  const outerTiers = ['wall_concrete', 'wall_cinder', 'fence_palisade', 'fence_chain'];
  const innerTiers = ['fence_palisade', 'fence_chain', 'fence_wood'];
  const gateCost = buyCost('gate_steel', 1) + (hasInner ? buyCost('gate_chain', 1) : 0);
  const pick = (tiers: string[], n: number, budget: number): string => {
    const usable = tiers.filter((t) => shelf(t) >= n);
    if (usable.length === 0) return tiers[tiers.length - 1];
    for (const t of usable) if (buyCost(t, n) <= budget) return t;
    return usable[usable.length - 1];
  };
  const innerMin = hasInner ? buyCost(pick(innerTiers, innerList.length, 0), innerList.length) : 0;
  const outerType = pick(outerTiers, outerList.length, state.money - baseCost - gateCost - innerMin);
  const innerType = hasInner ? pick(innerTiers, innerList.length, state.money - baseCost - gateCost - buyCost(outerType, outerList.length)) : null;

  const gateOuterType = shelf('gate_steel') >= 1 ? 'gate_steel' : 'gate_chain';
  const gateInnerType = shelf('gate_chain') >= 1 ? 'gate_chain' : 'gate_wood';
  if (!gateExists(outerGate) && !L.put(gateOuterType, outerGate[0], outerGate[1], outerGate[2], 'security', RANK.gate)) notes.push('The gate could not be placed because something is in the way.');
  if (hasInner && !gateExists(innerGate)) L.put(gateInnerType, innerGate[0], innerGate[1], innerGate[2], 'security', RANK.gate);
  let skipped = 0;
  for (const s of outerList) if (!L.put(outerType, s[0], s[1], s[2], 'security', RANK.outer)) skipped++;
  if (innerType) for (const s of innerList) if (!L.put(innerType, s[0], s[1], s[2], 'security', RANK.inner)) skipped++;
  if (skipped > 0) notes.push(`${skipped} wall sections could not be placed (not enough in stock).`);
  const keptSegs = outerSegs.filter((s) => !coversGate(s, outerGate)).length - outerList.length;
  if (keptSegs > 0) notes.push(`Your ${keptSegs} existing boundary sections stay as they are.`);

  const cart = cartOf(L, state, SEED_CYCLES, FEED_CYCLES);
  if (cart.seedsShort) notes.push(`The shop only has ${cart.seedsShort.have} bundles of seeds, so the greenhouse will run out sooner than ${SEED_CYCLES * 5} days.`);

  return {
    layout: L, notes, gateSide, seedsNeeded: cart.seedsNeeded, feedNeeded: cart.feedNeeded,
    edgeTypes: { outer: outerType, inner: innerType, gate: gateOuterType, innerGate: gateInnerType },
  };
}

/** What has to be ordered to place everything the layout holds, plus seeds and feed for the farms. */
function cartOf(L: Layout, state: GameState, seedCycles: number, feedCycles: number) {
  const need: Record<string, number> = {};
  for (const p of L.planned) need[p.type] = (need[p.type] ?? 0) + 1;
  const cart: Record<string, number> = {};
  for (const [type, qty] of Object.entries(need)) {
    const buy = qty - (state.storage[type] ?? 0);
    if (buy > 0) cart[type] = buy;
  }
  let seeds = 0;
  let feed = 0;
  for (const p of L.scratch.pieces) {
    const f = UTILITIES[p.type]?.farm;
    if (!f) continue;
    if (f.seeds) seeds += f.seeds.qty * seedCycles;
    if (f.feed) feed += f.feed.qty * feedCycles;
  }
  let seedsShort: { have: number } | null = null;
  const addSupply = (item: string, total: number) => {
    const want = total - (state.storage[item] ?? 0);
    if (want <= 0) return;
    const can = Math.min(want, stockOf(state, ONLINE_STORE_ID, item));
    if (can < want && item === 'seeds_veg') seedsShort = { have: can };
    if (can > 0) cart[item] = can;
  };
  if (seedCycles > 0) addSupply('seeds_veg', seeds);
  if (feedCycles > 0) addSupply('animal_feed', feed);
  return { cart, seedsNeeded: seeds, feedNeeded: feed, seedsShort: seedsShort as { have: number } | null };
}

/** Add pipe junctions and power poles until every farm has water and every machine has a power source to join. */
function linkUp(L: Layout, notes: string[], ringZone: (cx: number, cz: number, w: number, d: number) => boolean): void {
  void ringZone;
  const connector = { water: 'pipe_post', power: 'power_pole' } as const;
  for (let round = 0; round < 12; round++) {
    const topo = buildTopology(L.scratch);
    let target: { node: UNode; kind: 'water' | 'power' } | null = null;
    for (const n of topo.nodes.values()) {
      if (n.farm && n.farm.waterPerDay > 0) {
        const net = topo.waterOf.get(n.piece.id);
        if (!net?.nodes.some((m) => m !== n && (m.water!.makeLph || m.water!.storeL))) { target = { node: n, kind: 'water' }; break; }
      }
      if (n.power?.useKw) {
        const net = topo.powerOf.get(n.piece.id);
        if (!net?.nodes.some((m) => m.power!.makeKw || m.power!.storeKwh)) { target = { node: n, kind: 'power' }; break; }
      }
    }
    if (!target) return;

    const kind = target.kind;
    const type = connector[kind];
    const reach = UTILITIES[type][kind]!.reach;
    const has = (m: UNode) => (kind === 'water' ? !!(m.water?.makeLph || m.water?.storeL) : !!(m.power?.makeKw || m.power?.storeKwh));
    const sources = [...topo.nodes.values()].filter((m) => m[kind] && topo[kind === 'water' ? 'waterOf' : 'powerOf'].get(m.piece.id)?.nodes.some(has));
    if (sources.length === 0) return;
    const def = STRUCTURES[type];
    let best: { cx: number; cz: number; s: number } | null = null;
    const gg = L.grid;
    for (let cx = gg.minCx; cx < gg.maxCx; cx++) {
      for (let cz = gg.minCz; cz < gg.maxCz; cz++) {
        if (!L.can(type, cx, cz, 0)) continue;
        const r = gridRectOf(def, cx, cz, 0);
        const probe = { x: r.x, z: r.z, w: r.w, d: r.d } as UNode;
        const toNode = gapBetween(probe, target.node);
        if (toNode > reach) continue;
        let toNet = Infinity;
        for (const m of sources) toNet = Math.min(toNet, gapBetween(probe, m));
        if (toNet > reach) continue;
        const s = toNode + toNet;
        if (!best || s < best.s) best = { cx, cz, s };
      }
    }
    if (!best) {
      notes.push(`A ${STRUCTURES[target.node.piece.type].name.toLowerCase()} is too far from any ${kind === 'water' ? 'water' : 'power'} source to be linked.`);
      return;
    }
    L.put(type, best.cx, best.cz, 0, kind === 'water' ? 'water' : 'power', kind === 'water' ? RANK.pipe : RANK.pole);
  }
}

// ---------------------------------------------------------------- Proving the design

/** Run the finished design on a copy of the game for a few days and report what happens. */
function prove(state: GameState, pieces: Piece[], extra: Record<string, number>): PlanOutcome {
  const sim = structuredClone(state);
  sim.pieces = structuredClone(pieces);
  for (const p of sim.pieces) p.progress = 1;
  sim.at = 'base';
  sim.worldSeconds = worldSecondsAt(2, 8);
  sim.phase = 'prep';
  sim.survival.starterGiven = true;
  sim.storage = { ...state.storage };
  for (const [k, v] of Object.entries(extra)) sim.storage[k] = (sim.storage[k] ?? 0) + v;
  // Keep the family alive while the tanks fill, so the test measures the base, not the starting stock
  sim.storage.bottled_water = (sim.storage.bottled_water ?? 0) + 999;
  sim.storage.canned_food = (sim.storage.canned_food ?? 0) + 999;
  for (const id of Object.keys(sim.storage)) if (id in STRUCTURES) delete sim.storage[id];

  const seen = new Map<string, string>();
  for (let h = 0; h < 96; h += 4) {
    stepSim(sim, 0, 4 * 3600);
    flushSurvival(sim);
    // The first day and a half is warm-up: tanks and batteries start empty
    if (h < 36) continue;
    for (const list of runtimeOf(sim).issues.values()) for (const i of list) seen.set(i.code, i.text);
  }
  const s = summarize(sim);
  let farmWater = 0;
  for (const p of sim.pieces) {
    const f = UTILITIES[p.type]?.farm;
    if (f) farmWater += f.waterPerDay;
  }
  const mealsNeed = TARGET_PEOPLE * SURVIVAL.mealsPerPersonDay;
  const waterNeed = TARGET_PEOPLE * SURVIVAL.waterPerPersonDay + farmWater;
  const problems = [...seen.values()];
  return {
    people: TARGET_PEOPLE,
    mealsMake: s.food.makePerDay,
    mealsNeed,
    waterMake: s.water.makePerDay,
    waterNeed,
    waterStoreL: s.water.capacity,
    batteryKwh: s.power.capacityKwh,
    problems,
    ok: s.food.makePerDay >= mealsNeed && s.water.makePerDay >= waterNeed && problems.length === 0,
  };
}

// ---------------------------------------------------------------- Land

/** Whether the land is too small for a crop belt around an inner yard. */
function tooSmall(state: GameState): boolean {
  const g = gridOf(state);
  if (!g) return false;
  return !(g.maxCx - g.minCx - 6 >= 8 && g.maxCz - g.minCz - 6 >= 6);
}

/**
 * Which strips of land to buy so a small plot can hold the whole design. It grows the land toward a roughly square
 * 44 x 36 m, buying the cheapest allowed side each time, and stops early where roads or neighbours are in the way.
 * Works on a copy: nothing is bought here.
 */
function planLand(state: GameState): { sides: LandSide[]; cost: number } {
  const sim = structuredClone(state);
  sim.money = 1e12;
  const sides: LandSide[] = [];
  let cost = 0;
  if (!tooSmall(sim)) return { sides, cost };
  for (let i = 0; i < 16; i++) {
    const g = gridOf(sim);
    if (!g) break;
    const cols = g.maxCx - g.minCx;
    const rows = g.maxCz - g.minCz;
    const needCols = cols < PREFERRED_COLS;
    const needRows = rows < PREFERRED_ROWS;
    if (!needCols && !needRows) break;
    const colGap = (PREFERRED_COLS - cols) / PREFERRED_COLS;
    const rowGap = (PREFERRED_ROWS - rows) / PREFERRED_ROWS;
    const axes: LandSide[][] = needCols && (!needRows || colGap >= rowGap) ? [['e', 'w'], ['n', 's']] : [['n', 's'], ['e', 'w']];
    const plot = plotOf(sim)!;
    let pick: { side: LandSide; price: number } | null = null;
    for (const axis of axes) {
      // Only grow along an axis that still needs it
      if ((axis[0] === 'e' && !needCols) || (axis[0] === 'n' && !needRows)) continue;
      for (const side of axis) {
        if (expansionProblem(sim, side) !== null) continue;
        const price = expansionPrice(plot, sim.expansion, side);
        if (!pick || price < pick.price) pick = { side, price };
      }
      if (pick) break;
    }
    if (!pick) break;
    const r = expandPlot(sim, pick.side);
    if (!r.ok) break;
    sides.push(pick.side);
    cost += r.price;
  }
  return { sides, cost };
}

/** A copy of the game with the planned land already bought and its price already taken from the money. */
function withLand(state: GameState, land: { sides: LandSide[]; cost: number }): GameState {
  if (land.sides.length === 0) return state;
  const work = structuredClone(state);
  work.money = 1e12;
  for (const side of land.sides) expandPlot(work, side);
  work.money = state.money - land.cost;
  return work;
}

// ---------------------------------------------------------------- The plan

function makePlan(state: GameState, cfg: Config, land: { sides: LandSide[]; cost: number }): BasePlan {
  const built = layoutPlan(state, cfg);
  const L = built.layout;
  const { cart } = cartOf(L, state, SEED_CYCLES, FEED_CYCLES);

  // A week of food and water to live on while the farms and wells come up to speed
  const now = summarize(state);
  const pantry: Array<[string, number]> = [
    ['canned_food', Math.ceil(Math.max(0, TARGET_PEOPLE * SURVIVAL.mealsPerPersonDay * 7 - now.food.reserve) / MEALS_PER_ITEM.canned_food)],
    ['bottled_water', Math.ceil(Math.max(0, TARGET_PEOPLE * SURVIVAL.waterPerPersonDay * 7 - now.water.reserve) / WATER_PER_ITEM.bottled_water)],
  ];
  for (const [item, want] of pantry) {
    const can = Math.min(want, stockOf(state, ONLINE_STORE_ID, item));
    if (can > 0) cart[item] = (cart[item] ?? 0) + can;
  }
  // Everything wears out, so the base comes with the tools to look after it and some spare materials
  const upkeepKit: Array<[string, number]> = [
    ['toolbox', 1], ['shovel', 1], ['power_tools', 1], ['welding_kit', 1],
    ['lumber', 6], ['nails', 4], ['concrete', 4], ['steel_sheet', 4], ['screws', 4], ['wire_spool', 3], ['soap', 6], ['sandbags', 2],
  ];
  for (const [item, want] of upkeepKit) {
    const need = Math.min(want - (state.storage[item] ?? 0), stockOf(state, ONLINE_STORE_ID, item));
    if (need > 0) cart[item] = (cart[item] ?? 0) + need;
  }
  const lines: PlanLine[] = [];
  const counts = new Map<string, { qty: number; group: Group }>();
  for (const p of L.planned) {
    const c = counts.get(p.type) ?? { qty: 0, group: p.group };
    c.qty++;
    counts.set(p.type, c);
  }
  for (const [type, c] of counts) {
    const buy = Math.max(0, c.qty - (state.storage[type] ?? 0));
    const unit = itemPrice(ONLINE_STORE_ID, type, state.worldSeconds);
    lines.push({ type, name: STRUCTURES[type].name, group: c.group, qty: c.qty, buy, unit, total: buy * unit });
  }
  for (const item of ['seeds_veg', 'animal_feed']) {
    const buy = cart[item] ?? 0;
    if (buy <= 0) continue;
    const unit = itemPrice(ONLINE_STORE_ID, item, state.worldSeconds);
    lines.push({ type: item, name: itemById(item).name, group: 'food', qty: buy, buy, unit, total: buy * unit });
  }
  for (const [item, group] of [['canned_food', 'food'], ['bottled_water', 'water']] as const) {
    const buy = cart[item] ?? 0;
    if (buy <= 0) continue;
    const unit = itemPrice(ONLINE_STORE_ID, item, state.worldSeconds);
    lines.push({ type: item, name: itemById(item).name, group, qty: buy, buy, unit, total: buy * unit });
  }
  for (const [item] of upkeepKit) {
    const buy = cart[item] ?? 0;
    if (buy <= 0) continue;
    const unit = itemPrice(ONLINE_STORE_ID, item, state.worldSeconds);
    lines.push({ type: item, name: itemById(item).name, group: 'upkeep', qty: buy, buy, unit, total: buy * unit });
  }
  if (land.sides.length > 0) {
    lines.push({ type: 'land', name: 'extra land strips (10 m each)', group: 'land', qty: land.sides.length, buy: land.sides.length, unit: Math.round(land.cost / land.sides.length), total: land.cost });
  }
  lines.sort((a, b) => a.group.localeCompare(b.group) || b.total - a.total);

  const pieces = [...L.planned].sort((a, b) => a.rank - b.rank);
  const cartCost = quote(state, ONLINE_STORE_ID, cart).total;
  const cost = cartCost + land.cost;
  const crewMinutes = pieces.reduce((n, p) => n + STRUCTURES[p.type].buildMinutes, 0);
  const extra: Record<string, number> = {};
  for (const item of ['seeds_veg', 'animal_feed']) extra[item] = cart[item] ?? 0;

  return {
    pieces,
    buy: cart,
    lines,
    cost,
    shortfall: Math.max(0, cartCost - state.money),
    notes: [...new Set(land.sides.length > 0 ? [landNote(state, land), ...built.notes] : built.notes)],
    crewHours: crewMinutes / 60 / balance.crewSize,
    gateSide: ({ N: 'upper-right', E: 'lower-right', S: 'lower-left', W: 'upper-left' } as Record<Side, string>)[built.gateSide],
    outcome: prove(state, L.scratch.pieces, extra),
    land,
  };
}

function landNote(state: GameState, land: { sides: LandSide[]; cost: number }): string {
  const g = gridOf(state);
  const size = g ? `${(g.maxCx - g.minCx) * 2} x ${(g.maxCz - g.minCz) * 2} m` : '';
  return `The plot is too small for the whole design, so it buys ${land.sides.length} strips of land first. You will own ${size}.`;
}

/** Design an upgrade for the base as it is now. Returns null when there is nothing to plan (no plot, or the shops are closed). */
export function planBase(state: GameState): BasePlan | null {
  if (!state.plotId || state.phase !== 'prep' || !gridOf(state)) return null;
  const land = planLand(state);
  const work = withLand(state, land);
  let plan = makePlan(work, { powerBump: 0 }, land);
  for (let bump = 1; bump <= 2 && plan.outcome.problems.length > 0; bump++) {
    const next = makePlan(work, { powerBump: bump }, land);
    if (next.outcome.problems.length <= plan.outcome.problems.length) plan = next;
  }
  if (plan.outcome.problems.length > 0) {
    const bare = makePlan(work, { powerBump: 0, noLights: true }, land);
    if (bare.outcome.problems.length < plan.outcome.problems.length) {
      bare.notes.unshift('There was no room for power, so this design leaves out the floodlights and the medical station.');
      plan = bare;
    }
  }
  return plan;
}

export type BuildPlanResult = { ok: true; placed: number; spent: number; failed: number; landBought: number } | { ok: false; reason: string };

/** Buy everything in the plan from the online store and lay it out on the land. The crew builds it over game time. */
export function buildPlan(state: GameState, plan: BasePlan): BuildPlanResult {
  if (state.phase !== 'prep') return { ok: false, reason: 'The shops have closed.' };
  if (state.at !== 'base') return { ok: false, reason: 'Walk to your base to build.' };
  const before = state.money;
  if (plan.land.sides.length > 0) {
    if (state.money < plan.cost) return { ok: false, reason: `You need $${Math.ceil(plan.cost - state.money).toLocaleString('en-US')} more.` };
    for (const side of plan.land.sides) {
      const r = expandPlot(state, side);
      if (!r.ok) return { ok: false, reason: r.reason };
    }
  }
  if (Object.keys(plan.buy).length > 0) {
    const r = placeOrder(state, ONLINE_STORE_ID, plan.buy);
    if (!r.ok) return { ok: false, reason: r.reason };
  }
  let placed = 0;
  let failed = 0;
  for (const p of plan.pieces) {
    const r = placePiece(state, p.type, p.cx, p.cz, p.rot);
    if (r.ok) placed++;
    else failed++;
  }
  return { ok: true, placed, spent: before - state.money, failed, landBought: plan.land.sides.length };
}

/** Whether a structure type counts as part of the wall for the analysis. */
export function isBarrierType(type: string): boolean {
  return BARRIER_TYPES.test(type);
}
