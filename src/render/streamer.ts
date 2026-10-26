import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_HALF, type Rect } from '../data/city';
import { CLEAR_REACH, clearing, isCleared } from '../world/clearing';
import { CHUNK, chunkCoord, getChunk, inWorldChunk, type ChunkData } from '../world/gen';
import { applyEdgeFade, edgeFade, setEdgeRect } from './edgefade';
import { buildForestInto } from './forest';
import { glassMat, makeBuilding } from './models';
import { applySeasonGround } from './seasonfx';

/**
 * Draws the chunks of the world that are near the player and drops the rest. Each chunk is built from its
 * coordinates alone (see world/gen.ts), so leaving a place and coming back shows exactly the same houses and trees.
 */

/** Chunks closer than this to the player (meters, measured to the chunk's edge) are drawn. */
const LOAD_DISTANCE = 200;
/** Chunks farther than this are dropped. A little more than the load distance, so walking back and forth on a border does not rebuild. */
const UNLOAD_DISTANCE = 280;
/** The mist at the edge of the drawn world is this wide, in meters. */
const MIST_WIDTH = 75;

const roadMat = applyEdgeFade(new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }));
const dashMat = applyEdgeFade(new THREE.MeshStandardMaterial({ color: 0xe6d37a, roughness: 0.9 }));
const fieldMat = applySeasonGround(applyEdgeFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
const houseMat = applyEdgeFade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, flatShading: true }));
const dashGeo = new THREE.BoxGeometry(3, 0.02, 0.22);

/** Join every part of the same material into one mesh. Used to turn a chunk's houses into two or three meshes. */
function joinByMaterial(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  type Bucket = { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; sources: THREE.Mesh[] };
  const buckets = new Map<string, Bucket>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.geometry.getAttribute('position')) return;
    const swapped = (mesh.material as THREE.MeshStandardMaterial).vertexColors ? houseMat : mesh.material;
    const key = `${swapped.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: swapped, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], sources: [] };
      buckets.set(key, b);
    }
    const part = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) part.deleteAttribute(name);
    const count = part.getAttribute('position').count;
    if (!part.getAttribute('normal')) part.computeVertexNormals();
    if (!part.getAttribute('uv')) part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    b.parts.push(part);
    b.sources.push(mesh);
  });
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.parts, false);
    b.parts.forEach((p) => p.dispose());
    if (!merged) continue;
    for (const src of b.sources) {
      src.parent?.remove(src);
      src.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
}

/** Whether (x, z) is inside the crossing of two roads, where no lane marking is wanted. */
function inCrossing(x: number, z: number, roads: ChunkData['roads']): boolean {
  let nx = false;
  let nz = false;
  for (const r of roads) {
    // A road running north-south is narrow in x; an east-west one is narrow in z
    if (r.rect.w < r.rect.d) {
      if (Math.abs(x - r.rect.x) < r.rect.w / 2 + 1.2) nx = true;
    } else if (Math.abs(z - r.rect.z) < r.rect.d / 2 + 1.2) nz = true;
  }
  return nx && nz;
}

interface Loaded {
  chunk: ChunkData;
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  instanced: THREE.InstancedMesh[];
}

export class Streamer {
  private readonly loaded = new Map<string, Loaded>();
  private readonly mist = { minX: -WORLD_HALF, maxX: WORLD_HALF, minZ: -WORLD_HALF, maxZ: WORLD_HALF };
  private mistTarget = { ...this.mist };

  constructor(private readonly scene: THREE.Scene) {
    edgeFade.width.value = MIST_WIDTH;
    // Window glass belongs to the town as well as the chunks, so it fades with the rest
    applyEdgeFade(glassMat);
  }

  get count(): number {
    return this.loaded.size;
  }

  /** Whether the chunk at these coordinates is drawn right now. */
  has(cx: number, cz: number): boolean {
    return this.loaded.has(`${cx},${cz}`);
  }

  private build(chunk: ChunkData): Loaded {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const instanced: THREE.InstancedMesh[] = [];

    if (chunk.roads.length) {
      const parts = chunk.roads.map((r) => new THREE.PlaneGeometry(r.rect.w, r.rect.d).rotateX(-Math.PI / 2).translate(r.rect.x, 0.02, r.rect.z));
      const geo = mergeGeometries(parts)!;
      parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.receiveShadow = true;
      group.add(mesh);
      geometries.push(geo);

      // Lane markings
      const m4 = new THREE.Matrix4();
      const dashes: THREE.Matrix4[] = [];
      for (const r of chunk.roads) {
        const horizontal = r.rect.w > r.rect.d;
        const len = horizontal ? r.rect.w : r.rect.d;
        for (let t = -len / 2 + 2; t < len / 2 - 2; t += 6) {
          const x = horizontal ? r.rect.x + t : r.rect.x;
          const z = horizontal ? r.rect.z : r.rect.z + t;
          if (inCrossing(x, z, chunk.roads)) continue;
          m4.makeRotationY(horizontal ? 0 : Math.PI / 2);
          m4.setPosition(x, 0.06, z);
          dashes.push(m4.clone());
        }
      }
      if (dashes.length) {
        const im = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
        dashes.forEach((m, i) => im.setMatrixAt(i, m));
        im.receiveShadow = true;
        im.computeBoundingSphere();
        group.add(im);
        instanced.push(im);
      }
    }

    if (chunk.fields.length) {
      const parts = chunk.fields.map((f) => {
        const g = new THREE.PlaneGeometry(f.rect.w, f.rect.d).rotateX(-Math.PI / 2).translate(f.rect.x, 0.03, f.rect.z);
        const c = new THREE.Color(f.color);
        const rgb = new Float32Array(g.getAttribute('position').count * 3);
        for (let i = 0; i < rgb.length; i += 3) {
          rgb[i] = c.r;
          rgb[i + 1] = c.g;
          rgb[i + 2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
        return g;
      });
      const geo = mergeGeometries(parts)!;
      parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(geo, fieldMat);
      mesh.receiveShadow = true;
      group.add(mesh);
      geometries.push(geo);
    }

    if (chunk.houses.length) {
      const houses = new THREE.Group();
      for (const h of chunk.houses) houses.add(makeBuilding(h));
      group.add(houses);
      joinByMaterial(houses);
      houses.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) geometries.push((o as THREE.Mesh).geometry);
      });
    }

    if (chunk.trees.length) instanced.push(...buildForestInto(group, chunk.trees, isCleared));

    this.scene.add(group);
    return { chunk, group, geometries, instanced };
  }

  private drop(key: string): void {
    const l = this.loaded.get(key);
    if (!l) return;
    this.scene.remove(l.group);
    for (const g of l.geometries) g.dispose();
    // Instanced meshes share their shapes with every other chunk; only their per-tree buffers go
    for (const m of l.instanced) m.dispose();
    this.loaded.delete(key);
  }

  private wanted(x: number, z: number, distance: number): Array<{ cx: number; cz: number; d: number }> {
    const out: Array<{ cx: number; cz: number; d: number }> = [];
    const c0x = chunkCoord(x - distance);
    const c1x = chunkCoord(x + distance);
    const c0z = chunkCoord(z - distance);
    const c1z = chunkCoord(z + distance);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        if (!inWorldChunk(cx, cz)) continue;
        // Distance from the player to the chunk's nearest edge
        const dx = Math.max(cx * CHUNK - x, 0, x - (cx + 1) * CHUNK);
        const dz = Math.max(cz * CHUNK - z, 0, z - (cz + 1) * CHUNK);
        out.push({ cx, cz, d: Math.max(dx, dz) });
      }
    }
    return out;
  }

  /** Draw everything near (x, z) at once. Used when a game starts or the player is moved a long way. */
  loadAround(x: number, z: number): void {
    for (const w of this.wanted(x, z, LOAD_DISTANCE)) {
      const key = `${w.cx},${w.cz}`;
      if (!this.loaded.has(key)) this.loaded.set(key, this.build(getChunk(w.cx, w.cz)));
    }
    this.unloadFar(x, z);
    this.retarget(x, z);
    Object.assign(this.mist, this.mistTarget);
    this.pushMist();
  }

  private unloadFar(x: number, z: number): void {
    for (const [key, l] of [...this.loaded]) {
      const dx = Math.max(l.chunk.cx * CHUNK - x, 0, x - (l.chunk.cx + 1) * CHUNK);
      const dz = Math.max(l.chunk.cz * CHUNK - z, 0, z - (l.chunk.cz + 1) * CHUNK);
      if (Math.max(dx, dz) > UNLOAD_DISTANCE) this.drop(key);
    }
  }

  private retarget(x: number, z: number): void {
    const half = WORLD_HALF;
    this.mistTarget = {
      minX: Math.max(-half, chunkCoord(x - LOAD_DISTANCE) * CHUNK),
      maxX: Math.min(half, (chunkCoord(x + LOAD_DISTANCE) + 1) * CHUNK),
      minZ: Math.max(-half, chunkCoord(z - LOAD_DISTANCE) * CHUNK),
      maxZ: Math.min(half, (chunkCoord(z + LOAD_DISTANCE) + 1) * CHUNK),
    };
  }

  private pushMist(): void {
    setEdgeRect(this.mist.minX, this.mist.maxX, this.mist.minZ, this.mist.maxZ);
  }

  /** Call every frame with the player's position. Builds at most a few chunks per call, so walking never stutters. */
  update(x: number, z: number, realDt: number): void {
    this.unloadFar(x, z);
    const missing = this.wanted(x, z, LOAD_DISTANCE)
      .filter((w) => !this.loaded.has(`${w.cx},${w.cz}`))
      .sort((a, b) => a.d - b.d);
    const started = performance.now();
    for (const w of missing) {
      this.loaded.set(`${w.cx},${w.cz}`, this.build(getChunk(w.cx, w.cz)));
      if (performance.now() - started > 5) break;
    }
    this.retarget(x, z);
    // The mist moves out only as fast as chunks can be built
    const k = 1 - Math.exp(-1.6 * realDt);
    const m = this.mist;
    const t = this.mistTarget;
    // Never show past a chunk that has not been drawn yet
    const pending = missing.some((w) => !this.loaded.has(`${w.cx},${w.cz}`));
    for (const side of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
      const growing = side.startsWith('min') ? t[side] < m[side] : t[side] > m[side];
      if (growing && pending) continue;
      m[side] += (t[side] - m[side]) * k;
    }
    this.pushMist();
  }

  /** Redraw the chunks that touch a place whose trees have been cleared (or no longer are). */
  refreshNear(rect: Rect | null): void {
    const land = rect ?? clearing();
    if (!land) return;
    const reach = CLEAR_REACH + 2;
    const c0x = chunkCoord(land.x - land.w / 2 - reach);
    const c1x = chunkCoord(land.x + land.w / 2 + reach);
    const c0z = chunkCoord(land.z - land.d / 2 - reach);
    const c1z = chunkCoord(land.z + land.d / 2 + reach);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const key = `${cx},${cz}`;
        if (!this.loaded.has(key)) continue;
        this.drop(key);
        this.loaded.set(key, this.build(getChunk(cx, cz)));
      }
    }
  }

  /** Numbers for tests and the debug overlay. */
  stats(): { chunks: number; meshes: number; keys: string[] } {
    let meshes = 0;
    for (const l of this.loaded.values()) l.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    return { chunks: this.loaded.size, meshes, keys: [...this.loaded.keys()] };
  }
}
