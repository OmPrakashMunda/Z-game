import { mulberry32 } from '../sim/rng';

/** Rectangle on the ground plane. x/z is the CENTER, w is size along x, d is size along z. */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type LocationId =
  | 'motel'
  | 'supermarket'
  | 'hardware'
  | 'gas_station'
  | 'pharmacy'
  | 'farm_supply'
  | 'gun_shop'
  | 'vehicle_dealer'
  | 'real_estate';

export type PlotId = 'farm' | 'warehouse' | 'suburb' | 'woods';

/** What kind of house it is. Decides its size and (later) what can be found inside. */
export type HouseType = 'bungalow' | 'family' | 'villa' | 'farmhouse' | 'cabin';

/** The kind of country a spot lies in. */
export type Area = 'town' | 'suburb' | 'farmland' | 'woodland';

export type Facing = 'S' | 'N' | 'E' | 'W';

export interface BuildingDef {
  id: string;
  name: string;
  kind: 'shop' | 'house' | 'gas';
  x: number;
  z: number;
  /** Size in the model's own frame: w across the front, d from front to back. */
  w: number;
  d: number;
  h: number;
  /** Which side the door is on. Models are authored facing +z (south); N, E and W turn them. */
  facing: Facing;
  /** Houses only. */
  houseType?: HouseType;
  area?: Area;
  color: number;
  roofColor: number;
  accent: number;
  roof: 'flat' | 'pitched';
}

export interface LocationDef {
  id: LocationId;
  name: string;
  blurb: string;
  building: BuildingDef;
  /** Point where the player can interact. */
  entry: { x: number; z: number };
}

export interface PlotDef {
  id: PlotId;
  name: string;
  blurb: string;
  bounds: Rect;
  price: number;
  water: 'well' | 'stream' | 'none';
  /** 1 (hard to defend) to 5 (easy to defend). */
  defense: number;
  /** Colour of the cleared ground on the map. */
  ground: number;
}

export type PropKind =
  | 'tree' | 'oak' | 'bush' | 'rock'
  | 'barrel' | 'crate' | 'car' | 'lamp' | 'dumpster' | 'cone';

/** Prop kinds that are drawn in bulk as instanced meshes (forest). */
export const FOREST_KINDS: readonly PropKind[] = ['tree', 'oak', 'bush', 'rock'];

/** Half the width of the town square, in meters. The town is hand-made; everything outside it is generated in chunks. */
export const TOWN_HALF = 88;

/** The whole world is a square this far from the middle of town, in each direction. */
export const WORLD_HALF = 640;

/** The ground footprint of a building on the map (the model's width and depth swap when it faces east or west). */
export function footprint(b: Pick<BuildingDef, 'x' | 'z' | 'w' | 'd' | 'facing'>): Rect {
  const sideways = b.facing === 'E' || b.facing === 'W';
  return { x: b.x, z: b.z, w: sideways ? b.d : b.w, d: sideways ? b.w : b.d };
}

/** Whether (x, z) is within `margin` of the rectangle. */
export function inRect(r: Rect, x: number, z: number, margin: number): boolean {
  return Math.abs(x - r.x) <= r.w / 2 + margin && Math.abs(z - r.z) <= r.d / 2 + margin;
}

export interface PropDef {
  kind: PropKind;
  x: number;
  z: number;
  /** Rotation around Y in radians. */
  rot: number;
  variant: number;
}

/** A winding dirt track, stored as a smooth path of points. */
export interface DirtRoad {
  width: number;
  path: Array<{ x: number; z: number }>;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface City {
  /** Half-size of the town square in meters. */
  halfSize: number;
  /** How far the camera may travel. */
  bounds: WorldBounds;
  dirtRoads: DirtRoad[];
  roads: Rect[];
  pavements: Rect[];
  buildings: BuildingDef[];
  locations: LocationDef[];
  plots: PlotDef[];
  props: PropDef[];
  /** Static obstacles used for player and zombie collision. */
  colliders: Rect[];
}

const HALF = TOWN_HALF;

const SHOPS: Array<{
  id: LocationId;
  name: string;
  blurb: string;
  kind: 'shop' | 'gas';
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  facing: 'S' | 'N';
  color: number;
  accent: number;
  roofColor: number;
}> = [
  {
    id: 'supermarket', name: 'Fresh Mart', kind: 'shop',
    blurb: 'Canned food, water, basic medicine and household goods.',
    x: -40, z: -17, w: 26, d: 16, h: 5, facing: 'S',
    color: 0xe9e2d0, accent: 0xd9442f, roofColor: 0x6d6a66,
  },
  {
    id: 'hardware', name: 'Hammer & Nail', kind: 'shop',
    blurb: 'Tools, lumber, nails, containers, fencing and building materials.',
    x: -17, z: -15, w: 14, d: 12, h: 4.5, facing: 'S',
    color: 0xd49a3a, accent: 0x2f6fb3, roofColor: 0x5b4a3a,
  },
  {
    id: 'pharmacy', name: 'CarePlus Pharmacy', kind: 'shop',
    blurb: 'Bandages, antibiotics, painkillers and first aid supplies.',
    x: 16, z: -14, w: 12, d: 10, h: 4.5, facing: 'S',
    color: 0xf1f4f2, accent: 0x2e9e5b, roofColor: 0x77807b,
  },
  {
    id: 'gun_shop', name: "Dusty's Guns & Ammo", kind: 'shop',
    blurb: 'Firearms, ammunition and hunting gear.',
    x: 31, z: -14, w: 10, d: 10, h: 4.2, facing: 'S',
    color: 0x6e5a48, accent: 0xc99a2e, roofColor: 0x3d352f,
  },
  {
    id: 'real_estate', name: 'Hillside Realty', kind: 'shop',
    blurb: 'Buy land for your base. Ask about the three available plots.',
    x: 47, z: -14, w: 12, d: 10, h: 4.2, facing: 'S',
    color: 0xb9c6d8, accent: 0x1f3d6b, roofColor: 0x4b5666,
  },
  {
    id: 'vehicle_dealer', name: 'Rusty Wheels Autos', kind: 'shop',
    blurb: 'Pickup trucks and vans: more capacity and speed for supply runs.',
    x: -16, z: 15, w: 18, d: 12, h: 4.5, facing: 'S',
    color: 0x8aa0b5, accent: 0xe0b32c, roofColor: 0x4e5a66,
  },
  {
    id: 'farm_supply', name: 'Green Acres Farm Supply', kind: 'shop',
    blurb: 'Seeds, soil, tools, water tanks and animal feed.',
    x: 22, z: 15, w: 20, d: 12, h: 4.8, facing: 'S',
    color: 0x9b3d32, accent: 0x3f8f45, roofColor: 0x57504a,
  },
  {
    id: 'gas_station', name: 'Quick Fuel', kind: 'gas',
    blurb: 'Fuel cans, propane, motor oil and fuel stabilizer.',
    x: -45, z: 14, w: 9, d: 7, h: 3.6, facing: 'S',
    color: 0xe8e4da, accent: 0xd32f2f, roofColor: 0x666b70,
  },
  {
    id: 'motel', name: 'Roadside Motel', kind: 'shop',
    blurb: 'Your temporary room until your base is ready.',
    x: -69, z: -14, w: 16, d: 10, h: 4.2, facing: 'S',
    color: 0xcfae8a, accent: 0x2d6a8f, roofColor: 0x5a4636,
  },
];

const PLOTS: PlotDef[] = [
  {
    id: 'farm', name: 'Old Farmstead',
    blurb: 'Large and cheap, with a working well and open fields. Plenty of room to farm, but wide open and hard to defend.',
    bounds: { x: -55, z: 64, w: 40, d: 30 }, price: 120_000, water: 'well', defense: 2, ground: 0x8b7a55,
  },
  {
    id: 'warehouse', name: 'Warehouse Yard',
    blurb: 'A fenced concrete yard with a gate. Medium size, no water source, and easy to wall off.',
    bounds: { x: 25, z: 63, w: 30, d: 26 }, price: 180_000, water: 'none', defense: 4, ground: 0x8d8f91,
  },
  {
    id: 'suburb', name: 'Creekside Lot',
    blurb: 'Small, expensive lot on a stream. Close to town and easy to reach, but cramped.',
    bounds: { x: 60, z: 58, w: 20, d: 20 }, price: 150_000, water: 'stream', defense: 3, ground: 0x7d8f5c,
  },
  {
    id: 'woods', name: 'Deep Woods Clearing',
    blurb: 'A hidden clearing deep in the forest, reached by a long dirt road. Cheap, quiet and hard to spot, with a creek nearby. It is a long trip from town, and the trees hide whatever comes.',
    bounds: { x: 160, z: -38, w: 26, d: 24 }, price: 95_000, water: 'stream', defense: 4, ground: 0x6b5a3a,
  },
];

function buildCity(): City {
  const rand = mulberry32(1337);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const roads: Rect[] = [
    { x: 0, z: 0, w: 180, d: 10 },
    { x: 0, z: 0, w: 10, d: 180 },
    { x: 0, z: 42, w: 180, d: 6 },
    { x: 0, z: -52, w: 180, d: 6 },
  ];

  const buildings: BuildingDef[] = [];
  const locations: LocationDef[] = [];
  const pavements: Rect[] = [];

  for (const s of SHOPS) {
    const building: BuildingDef = {
      id: s.id, name: s.name, kind: s.kind, x: s.x, z: s.z, w: s.w, d: s.d, h: s.h,
      facing: s.facing, color: s.color, roofColor: s.roofColor, accent: s.accent, roof: 'flat',
    };
    buildings.push(building);
    const sign = s.facing === 'S' ? 1 : -1;
    const frontZ = s.z + sign * (s.d / 2);
    locations.push({
      id: s.id, name: s.name, blurb: s.blurb, building,
      entry: { x: s.x, z: frontZ + sign * 1.6 },
    });
    // Pavement in front of each shop
    const padDepth = s.kind === 'gas' ? 20 : 6;
    pavements.push({
      x: s.x,
      z: frontZ + sign * (padDepth / 2),
      w: s.w + (s.kind === 'gas' ? 8 : 4),
      d: padDepth,
    });
  }

  // Residential row north of the north road
  const houseColors = [0xd9c9a8, 0xc7d4c0, 0xd8b5a0, 0xb8c9d6, 0xe0d6b8, 0xcfb8c8];
  const roofColors = [0x7a3b2e, 0x4a5568, 0x5d4037, 0x3e4a3a];
  for (let hx = -72; hx <= 72; hx += 18) {
    if (Math.abs(hx) < 8) continue;
    const w = 8 + Math.floor(rand() * 3);
    const d = 7 + Math.floor(rand() * 3);
    buildings.push({
      id: `house_${hx}`, name: 'House', kind: 'house',
      x: hx, z: -64, w, d, h: 3.2, facing: 'S',
      color: pick(houseColors), roofColor: pick(roofColors), accent: 0xffffff, roof: 'pitched',
    });
  }

  const colliders: Rect[] = buildings.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d }));

  const reserved: Rect[] = [
    ...roads,
    ...pavements,
    ...PLOTS.map((p) => p.bounds),
    { x: -45, z: 26, w: 18, d: 16 }, // gas forecourt
  ];

  const props: PropDef[] = [];
  const addProp = (kind: PropKind, x: number, z: number, rot: number, variant: number, c?: { w: number; d: number }) => {
    props.push({ kind, x, z, rot, variant });
    if (c) colliders.push({ x, z, w: c.w, d: c.d });
  };

  const isFree = (x: number, z: number, margin: number): boolean => {
    if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return false;
    for (const r of reserved) if (inRect(r, x, z, margin)) return false;
    for (const b of buildings) if (inRect(b, x, z, margin + 1)) return false;
    for (const c of colliders) if (inRect(c, x, z, margin)) return false;
    return true;
  };

  // Dumpsters, crates and barrels around shops (local coordinates: front is +z)
  const toWorld = (b: BuildingDef, lx: number, lz: number) =>
    b.facing === 'S' ? { x: b.x + lx, z: b.z + lz } : { x: b.x - lx, z: b.z - lz };
  for (const b of buildings.filter((b) => b.kind !== 'house')) {
    const back = toWorld(b, b.w / 2 - 2, -b.d / 2 - 1.6);
    addProp('dumpster', back.x, back.z, 0, 0, { w: 2.2, d: 1.2 });
    const side = toWorld(b, -b.w / 2 - 1.6, -b.d / 4);
    addProp('barrel', side.x, side.z, 0, Math.floor(rand() * 3), { w: 0.8, d: 0.8 });
    addProp('barrel', side.x + 0.9, side.z + 0.3, 0, Math.floor(rand() * 3), { w: 0.8, d: 0.8 });
    const front = toWorld(b, b.w / 2 - 1.2, b.d / 2 + 0.9);
    addProp('crate', front.x, front.z, rand() * 0.6, 0, { w: 1, d: 1 });
  }

  // Parked cars along the main roads (parallel to the road)
  const carSpots: Array<{ x: number; z: number; rot: number }> = [];
  for (let i = 0; i < 9; i++) {
    const x = -78 + i * 19 + rand() * 6;
    if (Math.abs(x) < 9) continue;
    carSpots.push({ x, z: rand() < 0.5 ? -3.6 : 3.6, rot: Math.PI / 2 });
  }
  for (let i = 0; i < 7; i++) {
    const z = -78 + i * 24 + rand() * 6;
    if (Math.abs(z) < 9) continue;
    carSpots.push({ x: rand() < 0.5 ? -3.6 : 3.6, z, rot: 0 });
  }
  for (const c of carSpots) {
    const along = c.rot === 0 ? { w: 2.1, d: 4.5 } : { w: 4.5, d: 2.1 };
    addProp('car', c.x, c.z, c.rot, Math.floor(rand() * 6), along);
  }

  // Lamp posts along the main roads
  for (let x = -72; x <= 72; x += 24) {
    if (Math.abs(x) < 8) continue;
    addProp('lamp', x, 5.8, 0, 0, { w: 0.4, d: 0.4 });
    addProp('lamp', x, -5.8, 0, 0, { w: 0.4, d: 0.4 });
  }
  for (let z = -72; z <= 72; z += 24) {
    if (Math.abs(z) < 8) continue;
    addProp('lamp', 5.8, z, 0, 0, { w: 0.4, d: 0.4 });
    addProp('lamp', -5.8, z, 0, 0, { w: 0.4, d: 0.4 });
  }

  // Traffic cones at the intersection
  for (const [cx, cz] of [[6.5, 6.5], [-6.5, -6.5], [6.5, -6.5]] as const) {
    addProp('cone', cx, cz, 0, 0);
  }

  // Trees and bushes inside town: a mix of pines and oaks on free ground
  let trees = 0;
  for (let tries = 0; tries < 2500 && trees < 230; tries++) {
    const x = (rand() * 2 - 1) * (HALF - 2);
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (!isFree(x, z, 2.2)) continue;
    addProp(rand() < 0.3 ? 'oak' : 'tree', x, z, rand() * Math.PI * 2, Math.floor(rand() * 3), { w: 0.8, d: 0.8 });
    trees++;
  }
  let bushes = 0;
  for (let tries = 0; tries < 1500 && bushes < 130; tries++) {
    const x = (rand() * 2 - 1) * (HALF - 2);
    const z = (rand() * 2 - 1) * (HALF - 2);
    if (!isFree(x, z, 1.5)) continue;
    addProp('bush', x, z, rand() * Math.PI * 2, Math.floor(rand() * 2));
    bushes++;
  }

  // ---- The dirt road to the deep woods, leaving the east end of the main road
  const dirtRoad: DirtRoad = {
    width: 5,
    path: catmullRom(
      [[86, 0], [104, 4], [120, -3], [132, -15], [140, -26], [147, -31]],
      14,
    ),
  };

  return {
    halfSize: HALF,
    bounds: { minX: -WORLD_HALF, maxX: WORLD_HALF, minZ: -WORLD_HALF, maxZ: WORLD_HALF },
    dirtRoads: [dirtRoad],
    roads, pavements, buildings, locations, plots: PLOTS, props, colliders,
  };
}

/** Smooth path through the given points (uniform Catmull-Rom), sampled `steps` times per segment. */
function catmullRom(points: Array<[number, number]>, steps: number): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = points[points.length - 1];
  out.push({ x: last[0], z: last[1] });
  return out;
}

export function distanceToPath(path: Array<{ x: number; z: number }>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

export const city: City = buildCity();

export function locationById(id: LocationId): LocationDef {
  const loc = city.locations.find((l) => l.id === id);
  if (!loc) throw new Error(`Unknown location ${id}`);
  return loc;
}
