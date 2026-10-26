import { gridRectOf, STRUCTURES } from '../data/structures';
import { UTILITIES, type FarmSpec, type IssueKind, type PowerSpec, type WaterSpec } from '../data/survival';
import type { GameState, Piece } from './state';

/**
 * Which structures are connected to which. Power and water each form networks: two pieces join when the gap between
 * them is within the larger of their reaches, and at least one of the two is a conductor (a source, a tank, a battery,
 * or a pole or pipe junction). Plain machines such as lamps and gardens only plug in to a conductor, never to each other.
 */

export type NetKind = 'power' | 'water';

export interface UNode {
  piece: Piece;
  /** Center and size on the base grid, in meters. Only distances matter, so the plot's corner can be anywhere. */
  x: number;
  z: number;
  w: number;
  d: number;
  power?: PowerSpec;
  water?: WaterSpec;
  farm?: FarmSpec;
  /** False when the machine has no work to do right now, so it should not draw power (a filter with nothing to clean). */
  wanted: boolean;
}

export interface Network {
  id: number;
  kind: NetKind;
  nodes: UNode[];
}

export interface Link {
  a: number;
  b: number;
  kind: NetKind;
}

export interface Topology {
  signature: number;
  nodes: Map<number, UNode>;
  networks: Network[];
  powerOf: Map<number, Network>;
  waterOf: Map<number, Network>;
  links: Link[];
}

export interface Issue {
  kind: IssueKind;
  /** Short stable code, for tests. */
  code: string;
  /** Plain-language explanation that says what to do. */
  text: string;
}

/** Cheat switches. They live with the runtime notes, so they are never saved and end with the session. */
export interface CheatFlags {
  /** Hour of day the world is locked to (12 = always day, 0 = always night), or null. */
  hourLock: number | null;
  instantBuild: boolean;
  noWear: boolean;
  freeWork: boolean;
  godMode: boolean;
  freeShop: boolean;
  freeze: boolean;
  /** Vehicles use no fuel. */
  freeFuel: boolean;
  /** Crashes do no damage. */
  noDamage: boolean;
}

/** What the survival rules keep between steps. None of this is saved: it is rebuilt from the pieces. */
export interface Runtime {
  topo: Topology | null;
  /** Game seconds waiting to be simulated. */
  pending: number;
  issues: Map<number, Issue[]>;
  /** Share of demand each power network could meet in the last slice, 0 to 1. */
  powerSat: Map<number, number>;
  /** Water made in a slice that no tank had room for. The family can drink it straight away. */
  surplusFlow: number;
  /** Testing switch: turns hunger, thirst and the starter pack off. */
  disabled: boolean;
  cheats: CheatFlags;
}

const runtimes = new WeakMap<GameState, Runtime>();

export function runtimeOf(state: GameState): Runtime {
  let rt = runtimes.get(state);
  if (!rt) {
    rt = {
      topo: null, pending: 0, issues: new Map(), powerSat: new Map(), surplusFlow: 0,
      disabled: false,
      cheats: { hourLock: null, instantBuild: false, noWear: false, freeWork: false, godMode: false, freeShop: false, freeze: false, freeFuel: false, noDamage: false },
    };
    runtimes.set(state, rt);
  }
  return rt;
}

function signatureOf(pieces: Piece[]): number {
  let h = pieces.length;
  for (const p of pieces) h = (Math.imul(h, 31) + p.id * 2 + (p.progress >= 1 ? 1 : 0)) | 0;
  return h;
}

/** The empty space between two nodes, in meters (zero when they touch). */
export function gapBetween(a: UNode, b: UNode): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
  return Math.hypot(dx, dz);
}

export function buildTopology(state: GameState): Topology {
  const nodes = new Map<number, UNode>();
  for (const p of state.pieces) {
    if (p.progress < 1) continue;
    const u = UTILITIES[p.type];
    const def = STRUCTURES[p.type];
    if (!u || !def) continue;
    const r = gridRectOf(def, p.cx, p.cz, p.rot);
    nodes.set(p.id, {
      piece: p,
      x: r.x,
      z: r.z,
      w: r.w,
      d: r.d,
      power: u.power,
      water: u.water,
      farm: u.farm,
      wanted: true,
    });
  }

  const networks: Network[] = [];
  const links: Link[] = [];
  const powerOf = new Map<number, Network>();
  const waterOf = new Map<number, Network>();
  let nextNetId = 1;

  for (const kind of ['power', 'water'] as const) {
    const list = [...nodes.values()].filter((n) => n[kind]);
    const parent = new Map<number, number>(list.map((n) => [n.piece.id, n.piece.id]));
    const find = (id: number): number => {
      let r = id;
      while (parent.get(r) !== r) r = parent.get(r)!;
      let c = id;
      while (parent.get(c) !== r) {
        const next = parent.get(c)!;
        parent.set(c, r);
        c = next;
      }
      return r;
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const sa = a[kind]!;
        const sb = b[kind]!;
        if (!sa.conductor && !sb.conductor) continue;
        if (gapBetween(a, b) > Math.max(sa.reach, sb.reach) + 1e-6) continue;
        links.push({ a: a.piece.id, b: b.piece.id, kind });
        parent.set(find(a.piece.id), find(b.piece.id));
      }
    }
    const groups = new Map<number, Network>();
    for (const n of list) {
      const root = find(n.piece.id);
      let net = groups.get(root);
      if (!net) {
        net = { id: nextNetId++, kind, nodes: [] };
        groups.set(root, net);
        networks.push(net);
      }
      net.nodes.push(n);
      (kind === 'power' ? powerOf : waterOf).set(n.piece.id, net);
    }
  }

  // A water filter only draws power while its network has raw water to clean.
  for (const n of nodes.values()) {
    if (!n.water?.filterLph) continue;
    const net = waterOf.get(n.piece.id);
    n.wanted = !!net?.nodes.some((m) => m.water?.raw && m.water.makeLph);
  }

  return { signature: signatureOf(state.pieces), nodes, networks, powerOf, waterOf, links };
}

/** The connection map for the current pieces. It is rebuilt only when pieces are added, finished or removed. */
export function topologyOf(state: GameState): Topology {
  const rt = runtimeOf(state);
  const sig = signatureOf(state.pieces);
  if (!rt.topo || rt.topo.signature !== sig) rt.topo = buildTopology(state);
  return rt.topo;
}

/** Problems found on each structure in the last simulated slice. */
export function issuesOf(state: GameState): Map<number, Issue[]> {
  return runtimeOf(state).issues;
}
