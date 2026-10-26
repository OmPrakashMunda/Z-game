import { balance } from '../data/balance';
import { city, type PlotDef } from '../data/city';
import {
  CELL, edgeLength, footprint, gridRectOf, isEdgeStructure, isLineStructure, LINK_NX, LINK_NZ, LINK_PX, LINK_PZ, POST_END, POST_START,
  STRUCTURES, type StructureDef,
} from '../data/structures';
import { addMessage } from './messages';
import { noteSalvage, salvageOf } from './upkeep';
import { runtimeOf } from './utilities';
import type { Expansion, GameState, Piece } from './state';

export interface Grid {
  plot: PlotDef;
  /** World position of the ORIGINAL plot's corner with the lowest x and z. Cell numbers count from here, so they can be negative once the land grows. */
  originX: number;
  originZ: number;
  /** Size of the original plot in cells. */
  cols: number;
  rows: number;
  /** Range of cells you own now (max is exclusive). */
  minCx: number;
  maxCx: number;
  minCz: number;
  maxCz: number;
}

export function plotGrid(plotId: string | null, expansion?: Expansion): Grid | null {
  const plot = city.plots.find((p) => p.id === plotId);
  if (!plot) return null;
  const step = balance.landStepCells;
  const e = expansion ?? { n: 0, e: 0, s: 0, w: 0 };
  const cols = Math.floor(plot.bounds.w / CELL);
  const rows = Math.floor(plot.bounds.d / CELL);
  return {
    plot,
    originX: plot.bounds.x - plot.bounds.w / 2,
    originZ: plot.bounds.z - plot.bounds.d / 2,
    cols,
    rows,
    minCx: -e.w * step,
    maxCx: cols + e.e * step,
    minCz: -e.n * step,
    maxCz: rows + e.s * step,
  };
}

/** The grid for the land the player owns right now. */
export function gridOf(state: Pick<GameState, 'plotId' | 'expansion'>): Grid | null {
  return plotGrid(state.plotId, state.expansion);
}

/** World position of the center of a piece's footprint. */
export function pieceCenter(grid: Grid, type: string, cx: number, cz: number, rot: number): { x: number; z: number } {
  const r = gridRectOf(STRUCTURES[type], cx, cz, rot);
  return { x: grid.originX + r.x, z: grid.originZ + r.z };
}

function cellsOf(type: string, cx: number, cz: number, rot: number): Array<[number, number]> {
  // Fences and walls stand on the line between tiles, so they fill none
  if (isEdgeStructure(STRUCTURES[type])) return [];
  const fp = footprint(STRUCTURES[type], rot);
  const out: Array<[number, number]> = [];
  for (let x = cx; x < cx + fp.w; x++) for (let z = cz; z < cz + fp.d; z++) out.push([x, z]);
  return out;
}

export function occupiedCells(pieces: Piece[], ignoreId?: number): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    if (p.id === ignoreId) continue;
    for (const [x, z] of cellsOf(p.type, p.cx, p.cz, p.rot)) map.set(`${x},${z}`, p);
  }
  return map;
}

// ---------------------------------------------------------------- Pieces that stand on the line between tiles

/** The grid-line segments an edge piece lies on. `h:x,z` runs along x on the line z; `v:x,z` runs along z on the line x. */
export function edgeKeys(type: string, cx: number, cz: number, rot: number): string[] {
  const def = STRUCTURES[type];
  const len = edgeLength(def);
  const keys: string[] = [];
  for (let i = 0; i < len; i++) keys.push(rot % 2 === 0 ? `h:${cx + i},${cz}` : `v:${cx},${cz + i}`);
  return keys;
}

export function occupiedEdges(pieces: Piece[], ignoreId?: number): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    if (p.id === ignoreId || !isEdgeStructure(STRUCTURES[p.type])) continue;
    for (const key of edgeKeys(p.type, p.cx, p.cz, p.rot)) map.set(key, p);
  }
  return map;
}

function edgeProblem(
  pieces: Piece[], grid: Grid, def: StructureDef, cx: number, cz: number, rot: number, occupied: Map<string, Piece>,
): string | null {
  const len = edgeLength(def);
  const edges = occupiedEdges(pieces);
  for (let i = 0; i < len; i++) {
    // The tile this segment runs along must be on your land, and the line must be one of its sides
    const [tx, tz] = rot % 2 === 0 ? [cx + i, cz] : [cx, cz + i];
    const inside = rot % 2 === 0
      ? tx >= grid.minCx && tx < grid.maxCx && tz >= grid.minCz && tz <= grid.maxCz
      : tz >= grid.minCz && tz < grid.maxCz && tx >= grid.minCx && tx <= grid.maxCx;
    if (!inside) return 'It does not fit inside your land.';
    const key = rot % 2 === 0 ? `h:${tx},${tz}` : `v:${tx},${tz}`;
    if (edges.has(key)) return 'There is already a fence or wall there.';
    // It cannot run through the middle of a building: both tiles beside it belong to the same piece
    const a = rot % 2 === 0 ? occupied.get(`${tx},${tz - 1}`) : occupied.get(`${tx - 1},${tz}`);
    const b = occupied.get(`${tx},${tz}`);
    if (a && b && a.id === b.id) return 'Something is already there.';
  }
  return null;
}

/** The piece lying on the grid line segment nearest a point, if any. */
export function edgePieceNear(pieces: Piece[], grid: Grid, x: number, z: number, reach = 0.4): Piece | undefined {
  const near = nearestEdge(grid, x, z);
  if (near.distance > reach) return undefined;
  return occupiedEdges(pieces).get(near.key);
}

/** The grid line segment nearest a map point, and how far (in tiles) the point is from it. */
export function nearestEdge(grid: Grid, x: number, z: number): { key: string; orient: 'h' | 'v'; ex: number; ez: number; distance: number } {
  const u = (x - grid.originX) / CELL;
  const w = (z - grid.originZ) / CELL;
  const cx = Math.floor(u);
  const cz = Math.floor(w);
  const fu = u - cx;
  const fw = w - cz;
  const options = [
    { d: fw, orient: 'h' as const, ex: cx, ez: cz },
    { d: 1 - fw, orient: 'h' as const, ex: cx, ez: cz + 1 },
    { d: fu, orient: 'v' as const, ex: cx, ez: cz },
    { d: 1 - fu, orient: 'v' as const, ex: cx + 1, ez: cz },
  ];
  const best = options.reduce((a, b) => (b.d < a.d ? b : a));
  return { key: `${best.orient}:${best.ex},${best.ez}`, orient: best.orient, ex: best.ex, ez: best.ez, distance: best.d };
}

/**
 * Where a fence, wall or gate would go if you pointed at (x, z): snapped to the nearest grid line, and for a longer piece
 * (a gate) centred on the pointer along that line.
 */
export function edgeAnchor(grid: Grid, def: StructureDef, x: number, z: number): { cx: number; cz: number; rot: number } {
  const near = nearestEdge(grid, x, z);
  const len = edgeLength(def);
  const u = (x - grid.originX) / CELL;
  const w = (z - grid.originZ) / CELL;
  if (near.orient === 'h') return { cx: Math.round(u - len / 2), cz: near.ez, rot: 0 };
  return { cx: near.ex, cz: Math.round(w - len / 2), rot: 1 };
}

/**
 * Which end posts each edge piece draws. A post stands on every grid corner where a fence meets, drawn by just one of
 * the pieces there so they never overlap. Gates carry their own posts, so fences leave those corners alone.
 * `extra` is a piece that is not placed yet (the placement preview). It is treated as the newest.
 */
export function edgePostFlags(pieces: Piece[], extra?: Piece): Map<number, number> {
  const at = new Map<string, Array<{ piece: Piece; end: number }>>();
  const add = (piece: Piece) => {
    const def = STRUCTURES[piece.type];
    if (!isEdgeStructure(def)) return;
    const len = edgeLength(def);
    const along = piece.rot % 2 === 0;
    const start = `${piece.cx},${piece.cz}`;
    const end = along ? `${piece.cx + len},${piece.cz}` : `${piece.cx},${piece.cz + len}`;
    for (const [key, bit] of [[start, POST_START], [end, POST_END]] as const) {
      const list = at.get(key);
      if (list) list.push({ piece, end: bit });
      else at.set(key, [{ piece, end: bit }]);
    }
  };
  for (const p of pieces) add(p);
  if (extra) add(extra);

  const flags = new Map<number, number>();
  for (const list of at.values()) {
    const hasGate = list.some((e) => STRUCTURES[e.piece.type].look.model === 'gate');
    if (hasGate) continue; // the gate's own posts stand there
    const owner = list.reduce((a, b) => (b.piece.id < a.piece.id ? b : a));
    flags.set(owner.piece.id, (flags.get(owner.piece.id) ?? 0) | owner.end);
  }
  return flags;
}

/** Why a structure cannot go here, or null if it can. */
export function placementProblem(
  state: GameState, type: string, cx: number, cz: number, rot: number, occupied = occupiedCells(state.pieces),
): string | null {
  if (state.phase === 'dead') return 'You are dead.';
  const grid = gridOf(state);
  if (!grid) return 'You do not own a plot yet.';
  if (state.at !== 'base') return 'Walk to your base to build.';
  if (!STRUCTURES[type]) return 'That cannot be placed.';
  if ((state.storage[type] ?? 0) < 1) return 'You do not have one in storage.';
  const def = STRUCTURES[type];
  if (isEdgeStructure(def)) return edgeProblem(state.pieces, grid, def, cx, cz, rot, occupied);
  for (const [x, z] of cellsOf(type, cx, cz, rot)) {
    if (x < grid.minCx || z < grid.minCz || x >= grid.maxCx || z >= grid.maxCz) return 'It does not fit inside your land.';
    if (occupied.has(`${x},${z}`)) return 'Something is already there.';
  }
  return null;
}

export type BuildResult = { ok: true; piece: Piece } | { ok: false; reason: string };

export function placePiece(state: GameState, type: string, cx: number, cz: number, rot: number): BuildResult {
  const problem = placementProblem(state, type, cx, cz, rot);
  if (problem) return { ok: false, reason: problem };
  const def = STRUCTURES[type];
  state.storage[type] -= 1;
  if (state.storage[type] <= 0) delete state.storage[type];
  const piece: Piece = { id: state.nextId++, type, cx, cz, rot, hp: def.hp, maxHp: def.hp, progress: runtimeOf(state).cheats.instantBuild ? 1 : 0 };
  state.pieces.push(piece);
  return { ok: true, piece };
}

/** Take a structure down and put it back in storage. */
export function removePiece(state: GameState, pieceId: number): { ok: true; salvaged?: boolean } | { ok: false; reason: string } {
  if (state.at !== 'base') return { ok: false, reason: 'Walk to your base to take things down.' };
  const i = state.pieces.findIndex((p) => p.id === pieceId);
  if (i < 0) return { ok: false, reason: 'That is already gone.' };
  const [piece] = state.pieces.splice(i, 1);
  // A worn structure only gives back scrap, so taking it down and putting it up again is no free repair
  const salvage = salvageOf(piece);
  if (salvage) {
    noteSalvage(state, piece, salvage);
    return { ok: true, salvaged: true };
  }
  state.storage[piece.type] = (state.storage[piece.type] ?? 0) + 1;
  return { ok: true };
}

/** Why a structure that is already standing cannot stand at this spot instead (ignoring its own place), or null if it can. */
export function relocationProblem(state: GameState, pieceId: number, cx: number, cz: number, rot: number): string | null {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return 'That is gone.';
  const others = state.pieces.filter((p) => p.id !== pieceId);
  const alone: GameState = { ...state, pieces: others, storage: { ...state.storage, [piece.type]: 1 } };
  return placementProblem(alone, piece.type, cx, cz, rot);
}

/** Pick a structure up and put it down somewhere else, at once and free. It keeps its strength, upgrades and contents. */
export function movePiece(state: GameState, pieceId: number, cx: number, cz: number, rot: number): { ok: true } | { ok: false; reason: string } {
  const problem = relocationProblem(state, pieceId, cx, cz, rot);
  if (problem) return { ok: false, reason: problem };
  const piece = state.pieces.find((p) => p.id === pieceId)!;
  piece.cx = cx;
  piece.cz = cz;
  piece.rot = rot;
  return { ok: true };
}

/** Turn a structure a quarter turn where it stands (around its middle), at once and free. Tries the next turns if the first does not fit. */
export function rotatePiece(state: GameState, pieceId: number): { ok: true } | { ok: false; reason: string } {
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return { ok: false, reason: 'That is gone.' };
  if (state.at !== 'base') return { ok: false, reason: 'Walk to your base first.' };
  const def = STRUCTURES[piece.type];
  const edge = isEdgeStructure(def);
  const old = footprint(def, piece.rot);
  let first: string | null = null;
  for (let step = 1; step <= 3; step++) {
    const rot = (piece.rot + step) % 4;
    const now = footprint(def, rot);
    const cx = edge ? piece.cx : piece.cx + Math.round((old.w - now.w) / 2);
    const cz = edge ? piece.cz : piece.cz + Math.round((old.d - now.d) / 2);
    const problem = relocationProblem(state, pieceId, cx, cz, rot);
    if (problem === null) return movePiece(state, pieceId, cx, cz, rot);
    first ??= problem;
    // A square piece turns the same whichever way; no point trying again
    if (!edge && old.w === old.d) break;
  }
  return { ok: false, reason: first ?? 'It does not fit.' };
}

/**
 * Workers build the oldest unfinished pieces first, a few at a time. Works for any time step: when one piece
 * finishes part-way through, the next in line starts at that moment.
 */
export function advanceConstruction(state: GameState, worldDt: number): void {
  if (runtimeOf(state).cheats.instantBuild) {
    for (const p of state.pieces) p.progress = 1;
    return;
  }
  let remaining = worldDt;
  while (remaining > 1e-6) {
    const active = state.pieces.filter((p) => p.progress < 1).slice(0, balance.crewSize);
    if (active.length === 0) return;
    // Time until the first of the active pieces is finished
    const toFinish = Math.min(
      ...active.map((p) => (1 - p.progress) * STRUCTURES[p.type].buildMinutes * 60),
    );
    const step = Math.min(remaining, toFinish);
    for (const piece of active) {
      const def = STRUCTURES[piece.type];
      piece.progress = Math.min(1, piece.progress + step / (def.buildMinutes * 60));
      if (piece.progress >= 1 - 1e-9) {
        piece.progress = 1;
        if (def.buildMinutes >= 120) addMessage(state, `Your ${def.name.toLowerCase()} is finished.`, 'info');
      }
    }
    remaining -= step;
  }
}

/** Cheat: finish every piece that is still being built, at once. Returns how many it finished. */
export function finishAllConstruction(state: GameState): number {
  let finished = 0;
  for (const piece of state.pieces) {
    if (piece.progress < 1) {
      piece.progress = 1;
      finished++;
    }
  }
  return finished;
}

export function pieceAt(state: GameState, cx: number, cz: number): Piece | undefined {
  return occupiedCells(state.pieces).get(`${cx},${cz}`);
}

/** A hedge continues into the next cell only if that holds a hedge too. */
function continuesLine(neighbor: Piece): boolean {
  return isLineStructure(STRUCTURES[neighbor.type]);
}

/** Which neighbouring cells a hedge at this cell joins. See LINK_* in data/structures.ts. */
export function linksAt(occupied: Map<string, Piece>, cx: number, cz: number): number {
  let mask = 0;
  const test = (dx: number, dz: number, bit: number) => {
    const n = occupied.get(`${cx + dx},${cz + dz}`);
    if (n && continuesLine(n)) mask |= bit;
  };
  test(1, 0, LINK_PX);
  test(-1, 0, LINK_NX);
  test(0, 1, LINK_PZ);
  test(0, -1, LINK_NZ);
  return mask;
}