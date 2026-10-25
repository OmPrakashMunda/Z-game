import * as THREE from 'three';
import { LINK_NX, LINK_NZ, LINK_PX, LINK_PZ, POST_END, POST_START, type StructureDef } from '../data/structures';
import { addBox, addCyl, mat } from './models';

/**
 * Fences, walls, sandbag walls and hedges that join up with their neighbours.
 *
 * Each piece is built from half-length "arms" that run from the middle of its cell to the cell edge, plus posts. The
 * arms drawn depend on which neighbouring cells hold a piece of the same kind (see LINK_* in data/structures.ts), so a
 * run of pieces looks like one continuous wall, and corners, T-junctions and cross-roads close up with a post.
 *
 * Everything is drawn in grid directions (+x, -x, +z, -z), so these pieces ignore their rotation.
 */

const STEEL = 0x8a929a;

const glassCache = new Map<string, THREE.MeshStandardMaterial>();
function translucent(color: number, opacity: number): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}`;
  let m = glassCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.4, depthWrite: false });
    glassCache.set(key, m);
  }
  return m;
}

/** A kind of line piece. Arms run along +x from the cell centre (x = 0) to the cell edge (x = 1). */
interface Kit {
  arm(g: THREE.Group): void;
  /** A post or pillar standing at the origin. */
  post?(g: THREE.Group): void;
  /** Draw `post` at the two cell edges on a straight run. */
  edgePosts?: boolean;
  /** Draw `post` at the centre where lines meet (corners, T-junctions). Defaults to true. */
  junctionPost?: boolean;
  /** Always put something in the middle of the cell too, such as a hedge blob or a sandbag. */
  center?(g: THREE.Group, junction: boolean): void;
}

function rail(g: THREE.Group, length: number, thickness: number, color: number, y: number, z = 0): void {
  addBox(g, length, thickness, thickness, color, length / 2, y, z);
}

/** A round rail lying along the arm. */
function pipeRail(g: THREE.Group, radius: number, length: number, color: number, y: number): void {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 6), mat(color));
  m.rotation.z = Math.PI / 2;
  m.position.set(length / 2, y, 0);
  m.castShadow = true;
  g.add(m);
}

function fenceKit(def: StructureDef): Kit {
  const col = def.look.color ?? 0x888888;
  switch (def.look.variant) {
    case 'picket':
      return {
        edgePosts: true,
        post: (g) => void addBox(g, 0.14, 1.2, 0.14, col, 0, 0, 0),
        arm: (g) => {
          rail(g, 1, 0.07, col, 0.32, 0.06);
          rail(g, 1, 0.07, col, 0.78, 0.06);
          for (let i = 0; i < 3; i++) addBox(g, 0.2, 0.95 + (i % 2) * 0.06, 0.04, col, 0.17 + i * 0.33, 0.05, 0.1);
        },
      };
    case 'chain':
    case 'barbed': {
      const barbed = def.look.variant === 'barbed';
      return {
        edgePosts: true,
        post: (g) => void addCyl(g, 0.05, 0.05, barbed ? 2.3 : 1.9, STEEL, 0, 0, 0, 6),
        arm: (g) => {
          addBox(g, 1, 1.55, 0.02, translucent(0xc4ccd4, 0.5), 0.5, 0.2, 0);
          rail(g, 1, 0.04, STEEL, 0.18);
          pipeRail(g, 0.03, 1, STEEL, 1.78);
          if (barbed) {
            for (const y of [1.95, 2.1, 2.25]) rail(g, 1, 0.025, 0x55595d, y);
            for (let i = 0; i < 3; i++) for (const y of [1.95, 2.25]) addBox(g, 0.05, 0.05, 0.05, 0x333333, 0.15 + i * 0.3, y - 0.01, 0);
          }
        },
      };
    }
    case 'electric':
      return {
        edgePosts: true,
        post: (g) => {
          addBox(g, 0.1, 1.6, 0.1, 0x3d4a52, 0, 0, 0);
          addCyl(g, 0.07, 0.07, 0.12, 0xf0f0e8, 0, 1.55, 0, 6);
        },
        // The warning sign hangs on the middle of a straight run, so it never pokes past the cell edge
        center: (g, junction) => { if (!junction) addBox(g, 0.34, 0.22, 0.02, 0xf2c200, 0, 1.05, 0.08); },
        arm: (g) => {
          for (const y of [0.45, 0.85, 1.25, 1.62]) rail(g, 1, 0.03, 0xe8e0a0, y);
        },
      };
    case 'palisade': {
      const log = (g: THREE.Group, x: number, tall: boolean) => {
        const h = tall ? 2.55 : 2.3;
        addCyl(g, 0.19, 0.2, h, col, x, 0, 0, 7);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.4, 7), mat(col));
        tip.position.set(x, h + 0.2, 0);
        tip.castShadow = true;
        g.add(tip);
      };
      return {
        junctionPost: true,
        post: (g) => log(g, 0, true),
        center: (g, junction) => { if (!junction) log(g, 0, true); },
        arm: (g) => {
          log(g, 0.5, false);
          rail(g, 1, 0.12, 0x5b4630, 0.7, 0.21);
          rail(g, 1, 0.12, 0x5b4630, 1.5, 0.21);
        },
      };
    }
    default:
      return { arm: (g) => void rail(g, 1, 0.1, col, 0.5) };
  }
}

function wallKit(def: StructureDef): Kit {
  const col = def.look.color ?? 0x999999;
  switch (def.look.variant) {
    case 'cinder':
      return {
        post: (g) => {
          addBox(g, 0.46, 1.93, 0.46, col, 0, 0, 0);
          addBox(g, 0.54, 0.1, 0.54, 0x8b8b86, 0, 1.93, 0);
        },
        arm: (g) => {
          for (let row = 0; row < 7; row++) {
            const shade = row % 2 ? 0.93 : 1;
            addBox(g, 1, 0.26, 0.42, new THREE.Color(col).multiplyScalar(shade).getHex(), 0.5, row * 0.275, 0);
          }
          addBox(g, 1, 0.1, 0.5, 0x8b8b86, 0.5, 1.93, 0);
        },
      };
    case 'concrete':
      return {
        post: (g) => {
          addBox(g, 0.5, 2.3, 0.5, col, 0, 0, 0);
          addBox(g, 0.56, 0.14, 0.56, 0x9a9a95, 0, 2.3, 0);
        },
        arm: (g) => {
          addBox(g, 1, 2.3, 0.5, col, 0.5, 0, 0);
          addBox(g, 1, 0.14, 0.56, 0x9a9a95, 0.5, 2.3, 0);
          addBox(g, 0.04, 2.3, 0.02, 0x8d8d88, 0.4, 0, 0.26);
          addCyl(g, 0.03, 0.03, 0.3, 0x7b4a2a, 0.4, 2.4, 0, 5);
        },
      };
    default:
      // steel plate with a pillar at every cell edge
      return {
        edgePosts: true,
        post: (g) => {
          addBox(g, 0.16, 2.2, 0.34, 0x4d555f, 0, 0, 0);
          for (const y of [0.3, 1.0, 1.7]) addCyl(g, 0.04, 0.04, 0.04, 0xb9c0c7, 0, y, 0.19, 6).rotation.x = Math.PI / 2;
        },
        arm: (g) => {
          addBox(g, 1, 2.1, 0.28, col, 0.5, 0, 0);
          for (const y of [0.35, 1.05, 1.75]) addBox(g, 1, 0.1, 0.34, 0x58606b, 0.5, y, 0);
          addBox(g, 1, 0.08, 0.34, 0xd8a31c, 0.5, 2.1, 0);
        },
      };
  }
}

function sandbagKit(): Kit {
  const bag = 0xb59d6a;
  const rows = 4;
  const one = (g: THREE.Group, x: number, r: number, seed: number) => {
    const b = addBox(g, 0.52, 0.24, 0.36, new THREE.Color(bag).multiplyScalar(0.9 + ((seed * 7 + r * 3) % 5) * 0.03).getHex(), x, r * 0.23, 0);
    b.rotation.y = ((seed * 13 + r * 5) % 7 - 3) * 0.03;
  };
  return {
    junctionPost: false,
    post: (g) => { for (let r = 0; r < rows; r++) one(g, 0, r, 20 + r); },
    // Bags in alternate rows are offset by half a bag, so odd rows have a bag in the cell middle
    center: (g, junction) => {
      for (let r = 0; r < rows; r++) if (r % 2 === 1 || junction) one(g, 0, r, 9 + r);
    },
    arm: (g) => {
      for (let r = 0; r < rows; r++) {
        if (r % 2 === 0) { one(g, 0.25, r, 1 + r); one(g, 0.75, r, 2 + r); }
        else one(g, 0.5, r, 3 + r);
      }
    },
  };
}

function hedgeKit(): Kit {
  const blob = (g: THREE.Group, x: number, i: number) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat(i % 2 ? 0x4a8a44 : 0x3f7a3d));
    m.position.set(x, 0.95, (i % 2) * 0.08 - 0.04);
    m.castShadow = true;
    g.add(m);
  };
  return {
    junctionPost: true,
    post: (g) => void addBox(g, 0.7, 0.9, 0.7, 0x3a7338, 0, 0, 0),
    center: (g) => blob(g, 0, 1),
    arm: (g) => {
      addBox(g, 1, 0.9, 0.7, 0x3a7338, 0.5, 0, 0);
      blob(g, 0.35, 0);
      blob(g, 0.64, 1);
    },
  };
}

function kitFor(def: StructureDef): Kit {
  switch (def.look.model) {
    case 'fence': return fenceKit(def);
    case 'wall': return wallKit(def);
    case 'sandbags': return sandbagKit();
    default: return hedgeKit();
  }
}

/** The four directions an arm can point: rotation about y, and whether to mirror it so its good side stays the same. */
const DIRS = [
  { bit: LINK_PX, rot: 0, mirror: false, x: 1, z: 0 },
  { bit: LINK_NX, rot: 0, mirror: true, x: -1, z: 0 },
  { bit: LINK_PZ, rot: -Math.PI / 2, mirror: false, x: 0, z: 1 },
  { bit: LINK_NZ, rot: -Math.PI / 2, mirror: true, x: 0, z: -1 },
] as const;

/**
 * Build a fence, wall or sandbag wall that stands on a grid line: one straight 2 m panel centred on the middle of its
 * line segment and running along x. A post stands on each grid corner the piece owns (see POST_* in data/structures.ts),
 * so a corner or a T-junction closes up with a single post and nothing doubles up.
 */
export function buildEdge(def: StructureDef, posts: number): THREE.Group {
  const kit = kitFor(def);
  const g = new THREE.Group();
  for (const mirror of [false, true]) {
    const arm = new THREE.Group();
    kit.arm(arm);
    arm.scale.x = mirror ? -1 : 1;
    g.add(arm);
  }
  kit.center?.(g, false);
  if (kit.post) {
    for (const [bit, x] of [[POST_START, -1], [POST_END, 1]] as const) {
      if (!(posts & bit)) continue;
      const p = new THREE.Group();
      kit.post(p);
      p.position.set(x, 0, 0);
      g.add(p);
    }
  }
  return g;
}

/** Build a hedge that joins the neighbouring hedges in `links`. */
export function buildLine(def: StructureDef, links: number): THREE.Group {
  const kit = kitFor(def);
  const g = new THREE.Group();

  const onX = (links & (LINK_PX | LINK_NX)) !== 0;
  const onZ = (links & (LINK_PZ | LINK_NZ)) !== 0;
  const junction = onX && onZ;

  // Which arms to draw: a straight run keeps both halves of its axis, a junction only the sides that connect
  const arms = DIRS.filter((d) => {
    if (junction) return (links & d.bit) !== 0;
    if (onZ) return d.z !== 0;
    return d.x !== 0; // along x: no links at all, or links on the x axis
  });

  for (const d of arms) {
    const arm = new THREE.Group();
    kit.arm(arm);
    arm.scale.x = d.mirror ? -1 : 1;
    const holder = new THREE.Group();
    holder.rotation.y = d.rot;
    holder.add(arm);
    g.add(holder);
  }

  const place = (x: number, z: number) => {
    const p = new THREE.Group();
    kit.post!(p);
    p.position.set(x, 0, z);
    g.add(p);
  };
  if (kit.post) {
    // One post in the middle of every cell on a straight run, so posts stand 2 m apart; at junctions only if wanted
    if (junction ? kit.junctionPost !== false : !!kit.edgePosts) place(0, 0);
    // A run that stops here gets a cap post at its free end
    if (!junction && kit.edgePosts) {
      const alongX = !onZ;
      const plus = alongX ? LINK_PX : LINK_PZ;
      const minus = alongX ? LINK_NX : LINK_NZ;
      const e = 0.97;
      if (!(links & plus)) place(alongX ? e : 0, alongX ? 0 : e);
      if (!(links & minus)) place(alongX ? -e : 0, alongX ? 0 : -e);
    }
  }
  kit.center?.(g, junction);
  return g;
}
