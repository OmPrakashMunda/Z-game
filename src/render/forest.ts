import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TOWN_HALF, type PropDef } from '../data/city';
import { applyEdgeFade, applyTrunkTint } from './edgefade';

/**
 * Trees, bushes and rocks drawn as a handful of instanced meshes per chunk. Thousands of trees cost a few draw calls
 * this way, instead of thousands. The shapes and the materials are shared by every chunk.
 */

/** Join shapes into one. Parts marked as trunk get a flag the tree material uses to keep them brown. */
function joinParts(parts: Array<[THREE.BufferGeometry, boolean]>): THREE.BufferGeometry {
  const flat = parts.map(([g, trunk]) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.setAttribute('aTrunk', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count).fill(trunk ? 1 : 0), 1));
    return n;
  });
  return mergeGeometries(flat)!;
}

let material: THREE.Material | null = null;
let treeMaterial: THREE.Material | null = null;
const shapes = new Map<string, THREE.BufferGeometry>();

function materials(): { plain: THREE.Material; tree: THREE.Material } {
  material ??= applyEdgeFade(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }));
  treeMaterial ??= applyTrunkTint(applyEdgeFade(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true })));
  return { plain: material, tree: treeMaterial };
}

function shape(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = shapes.get(key);
  if (!g) {
    g = build();
    shapes.set(key, g);
  }
  return g;
}

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Plant the props under `parent`. Props for which `skip` is true are left out. Returns the meshes, so the caller can
 * release their buffers when the chunk goes away.
 */
export function buildForestInto(parent: THREE.Object3D, all: PropDef[], skip?: (x: number, z: number) => boolean): THREE.InstancedMesh[] {
  const props = skip ? all.filter((p) => !skip(p.x, p.z)) : all;
  const made: THREE.InstancedMesh[] = [];
  const { plain, tree } = materials();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Trees outside the town are a little darker, so the deep woods feel heavier.
  const shadeFor = (p: PropDef) => {
    const outside = Math.max(Math.abs(p.x), Math.abs(p.z)) > TOWN_HALF;
    return (0.8 + hash(p.x, p.z) * 0.35) * (outside ? 0.86 : 1);
  };
  const make = (geo: THREE.BufferGeometry, count: number, kind: 'plain' | 'tree' = 'plain') => {
    const m = new THREE.InstancedMesh(geo, kind === 'tree' ? tree : plain, count);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    made.push(m);
    return m;
  };
  const put = (
    mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number,
    rot: number, sx: number, sy: number, sz: number, hex: number, shade: number,
  ) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(hex).multiplyScalar(shade));
  };
  const done = (mesh: THREE.InstancedMesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Chunks are small and far apart, so each one gets a tight bounding box and can be skipped when off screen
    mesh.computeBoundingSphere();
  };
  /** Rotate an offset around the Y axis. */
  const rotated = (ox: number, oz: number, rot: number) => ({
    x: ox * Math.cos(rot) + oz * Math.sin(rot),
    z: -ox * Math.sin(rot) + oz * Math.cos(rot),
  });

  const pines = props.filter((p) => p.kind === 'tree');
  const oaks = props.filter((p) => p.kind === 'oak');
  const bushes = props.filter((p) => p.kind === 'bush');
  const rocks = props.filter((p) => p.kind === 'rock');
  const scaleOf = (p: PropDef) => 0.85 + hash(p.z, p.x) * 0.8;

  // A whole tree (trunk and foliage) is one shape and one instance. The trunk is marked in the shape so it keeps its
  // brown while the foliage takes the instance colour.
  const trunkGeo = () => new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6, 1, true).translate(0, 0.9, 0);
  const pineGeo = () => joinParts([[trunkGeo(), true],
    [new THREE.ConeGeometry(1.7, 2.6, 7, 1, true).translate(0, 2.7, 0), false],
    [new THREE.ConeGeometry(1.3, 2.2, 7, 1, true).translate(0, 4.0, 0), false],
    [new THREE.ConeGeometry(0.85, 1.8, 7, 1, true).translate(0, 5.1, 0), false]]);
  const oakGeo = () => joinParts([[trunkGeo(), true],
    [new THREE.IcosahedronGeometry(1.9, 0).scale(1, 0.85, 1).translate(0, 3.6, 0), false],
    [new THREE.IcosahedronGeometry(1.4, 0).translate(0.9, 4.5, 0.5), false]]);

  if (pines.length) {
    const greens = [0x2f6b3a, 0x3b8247, 0x4a8f3f];
    const mesh = make(shape('pine', pineGeo), pines.length, 'tree');
    pines.forEach((p, i) => {
      const s = scaleOf(p);
      put(mesh, i, p.x, 0, p.z, p.rot, s, s, s, greens[p.variant % 3], shadeFor(p));
    });
    done(mesh);
  }

  if (oaks.length) {
    const greens = [0x4f8f3a, 0x5fa042, 0x6a9a3a];
    const mesh = make(shape('oak', oakGeo), oaks.length, 'tree');
    oaks.forEach((p, i) => {
      const s = scaleOf(p);
      // A few oaks have turned for autumn
      const hex = p.variant === 2 && hash(p.x, p.z) > 0.85 ? 0xb5762e : greens[p.variant % 3];
      put(mesh, i, p.x, 0, p.z, p.rot, s, s, s, hex, shadeFor(p));
    });
    done(mesh);
  }

  // Bushes: three blobs each
  if (bushes.length) {
    const blobs = make(shape('bush', () => new THREE.IcosahedronGeometry(1, 0)), bushes.length * 3);
    const offsets: Array<[number, number, number]> = [[0, 0, 0.7], [0.55, 0.5, 0.2], [-0.45, 0.55, 0.25]];
    bushes.forEach((p, b) => {
      offsets.forEach(([ox, r, oz], k) => {
        const o = rotated(ox, oz, p.rot);
        const s = r === 0 ? 0.7 : r;
        put(blobs, b * 3 + k, p.x + o.x, s * 0.8, p.z + o.z, p.rot, s, s, s, p.variant ? 0x54914a : 0x3f7a3d, shadeFor(p));
      });
    });
    blobs.castShadow = false;
    done(blobs);
  }

  // Rocks
  if (rocks.length) {
    const stones = make(shape('rock', () => new THREE.DodecahedronGeometry(1, 0)), rocks.length);
    rocks.forEach((p, i) => {
      const s = 0.5 + hash(p.x, p.z) * 0.9;
      put(stones, i, p.x, s * 0.25, p.z, p.rot, s, s * 0.6, s * 0.85, 0x7d8084, 0.8 + hash(p.z, p.x) * 0.3);
    });
    stones.castShadow = false;
    done(stones);
  }
  return made;
}
