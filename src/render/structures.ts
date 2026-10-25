import * as THREE from 'three';
import { CELL, isEdgeStructure, isLineStructure, POST_END, POST_START, type ModelKind, type StructureDef } from '../data/structures';
import { buildEdge, buildLine } from './lines';
import { addBox, addCyl, glassMat, lampBulbMat, mat } from './models';

/**
 * Procedural models for every placeable structure. Each builder returns a group centered on its footprint, with the
 * ground at y = 0. Models are authored for rotation 0: the long side runs along x and the "front" faces +z.
 */

type Builder = (def: StructureDef, W: number, D: number) => THREE.Group;

const translucentCache = new Map<string, THREE.MeshStandardMaterial>();
function translucent(color: number, opacity: number): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}`;
  let m = translucentCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.4, depthWrite: false });
    translucentCache.set(key, m);
  }
  return m;
}

const corrugatedCache = new Map<string, THREE.MeshStandardMaterial>();
/** Sheet metal with vertical corrugation. `length` is how many meters the sheet runs along its u direction. */
function corrugated(color: number, length: number): THREE.MeshStandardMaterial {
  const key = `${color}|${length}`;
  let m = corrugatedCache.get(key);
  if (m) return m;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(i * 16 + 10, 0, 4, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(i * 16 + 4, 0, 3, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, length / 0.9), 1);
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
  corrugatedCache.set(key, m);
  return m;
}

const col1 = (d: StructureDef) => d.look.color ?? 0x888888;
const col2 = (d: StructureDef) => d.look.color2 ?? 0x555555;
const variantOf = (d: StructureDef) => d.look.variant ?? '';
const STEEL = 0x8a929a;
const DARK = 0x2b2f33;

function pitchedRoof(w: number, d: number, rise: number, color: number, over = 0.35): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - over, 0);
  shape.lineTo(w / 2 + over, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + over * 2, bevelEnabled: false }), mat(color, 0.95));
  mesh.position.z = -(d + over * 2) / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function windowAt(g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, side: 'front' | 'back' | 'left' | 'right'): void {
  const frame = side === 'front' || side === 'back' ? [w + 0.2, h + 0.2, 0.12] : [0.12, h + 0.2, w + 0.2];
  const pane = side === 'front' || side === 'back' ? [w, h, 0.1] : [0.1, h, w];
  const dz = side === 'front' ? 0.02 : side === 'back' ? -0.02 : 0;
  const dx = side === 'right' ? 0.02 : side === 'left' ? -0.02 : 0;
  addBox(g, frame[0], frame[1], frame[2], 0xf2f2ee, x + dx, y - 0.1, z + dz);
  addBox(g, pane[0], pane[1], pane[2], glassMat, x + dx * 3, y, z + dz * 3);
}

// ------------------------------------------------------------------ Fences, walls, gates

const fence: Builder = (def) => {
  const g = new THREE.Group();
  const col = col1(def);
  const L = 2;
  switch (variantOf(def)) {
    case 'picket': {
      for (const x of [-0.95, 0.95]) addBox(g, 0.14, 1.2, 0.14, col, x, 0, 0);
      addBox(g, L, 0.07, 0.05, col, 0, 0.32, 0.06);
      addBox(g, L, 0.07, 0.05, col, 0, 0.78, 0.06);
      for (let i = 0; i < 6; i++) addBox(g, 0.2, 0.95 + (i % 2) * 0.06, 0.04, col, -0.85 + i * 0.34, 0.05, 0.1);
      break;
    }
    case 'chain':
    case 'barbed': {
      for (const x of [-0.95, 0.95]) addCyl(g, 0.05, 0.05, variantOf(def) === 'barbed' ? 2.3 : 1.9, STEEL, x, 0, 0, 6);
      addCyl(g, 0.03, 0.03, L, STEEL, 0, 1.78, 0, 6).rotation.z = Math.PI / 2;
      addBox(g, L - 0.1, 1.55, 0.02, translucent(0xc4ccd4, 0.5), 0, 0.2, 0);
      addBox(g, L, 0.04, 0.05, STEEL, 0, 0.18, 0);
      if (variantOf(def) === 'barbed') {
        for (const y of [1.95, 2.1, 2.25]) addBox(g, L, 0.025, 0.025, 0x55595d, 0, y, 0);
        for (let i = 0; i < 7; i++) for (const y of [1.95, 2.25]) addBox(g, 0.05, 0.05, 0.05, 0x333333, -0.9 + i * 0.3, y - 0.01, 0);
      }
      break;
    }
    case 'electric': {
      for (const x of [-0.95, 0.95]) {
        addBox(g, 0.1, 1.6, 0.1, 0x3d4a52, x, 0, 0);
        addCyl(g, 0.07, 0.07, 0.12, 0xf0f0e8, x, 1.55, 0, 6);
      }
      for (const y of [0.45, 0.85, 1.25, 1.62]) addBox(g, L, 0.03, 0.03, 0xe8e0a0, 0, y, 0);
      addBox(g, 0.34, 0.22, 0.02, 0xf2c200, 0, 1.05, 0.06);
      break;
    }
    case 'palisade': {
      for (let i = 0; i < 5; i++) {
        const x = -0.8 + i * 0.4;
        const h = 2.3 + (i % 2) * 0.25;
        addCyl(g, 0.19, 0.2, h, col, x, 0, (i % 2) * 0.04, 7);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.4, 7), mat(col));
        tip.position.set(x, h + 0.2, (i % 2) * 0.04);
        tip.castShadow = true;
        g.add(tip);
      }
      addBox(g, L, 0.12, 0.08, 0x5b4630, 0, 0.7, 0.21);
      addBox(g, L, 0.12, 0.08, 0x5b4630, 0, 1.5, 0.21);
      break;
    }
  }
  return g;
};

const wall: Builder = (def) => {
  const g = new THREE.Group();
  const col = col1(def);
  switch (variantOf(def)) {
    case 'cinder': {
      for (let row = 0; row < 7; row++) {
        const shade = row % 2 ? 0.93 : 1;
        addBox(g, 2, 0.26, 0.42, new THREE.Color(col).multiplyScalar(shade).getHex(), 0, row * 0.275, 0);
      }
      addBox(g, 2.06, 0.1, 0.5, 0x8b8b86, 0, 1.93, 0);
      break;
    }
    case 'concrete': {
      addBox(g, 2, 2.3, 0.5, col, 0, 0, 0);
      addBox(g, 2.06, 0.14, 0.56, 0x9a9a95, 0, 2.3, 0);
      for (const x of [-0.65, 0.05, 0.75]) addBox(g, 0.04, 2.3, 0.02, 0x8d8d88, x, 0, 0.26);
      for (const x of [-0.7, 0, 0.7]) addCyl(g, 0.03, 0.03, 0.3, 0x7b4a2a, x, 2.4, 0, 5);
      break;
    }
    case 'steel': {
      addBox(g, 2, 2.1, 0.28, col, 0, 0, 0);
      for (const y of [0.35, 1.05, 1.75]) addBox(g, 2.04, 0.1, 0.34, 0x58606b, 0, y, 0);
      for (const x of [-0.92, 0.92]) addBox(g, 0.16, 2.2, 0.34, 0x4d555f, x, 0, 0);
      for (const x of [-0.92, 0.92]) for (const y of [0.3, 1.0, 1.7]) addCyl(g, 0.04, 0.04, 0.04, 0xb9c0c7, x, y, 0.19, 6).rotation.x = Math.PI / 2;
      addBox(g, 2.04, 0.08, 0.34, 0xd8a31c, 0, 2.1, 0);
      break;
    }
  }
  return g;
};

const container: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const col = col1(def);
  const h = 2.3;
  const w = D - 0.1;
  const side = corrugated(col, W);
  const end = mat(new THREE.Color(col).multiplyScalar(0.8).getHex(), 0.6);
  const top = corrugated(new THREE.Color(col).multiplyScalar(0.92).getHex(), W);
  // Box faces in order: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, h, w), [end, end, top, end, side, side]);
  body.position.y = 0.25 + h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // Corner posts and base frame
  for (const x of [-1, 1]) for (const z of [-1, 1]) addBox(g, 0.14, h + 0.1, 0.14, 0x30343a, x * (W / 2 - 0.1), 0.2, z * (w / 2 - 0.02));
  addBox(g, W, 0.2, w, 0x30343a, 0, 0.05, 0);
  // Doors on the +x end: two leaves with locking bars
  for (const z of [-0.4, 0.4]) addBox(g, 0.04, h - 0.2, 0.7, 0x2a2e33, W / 2 + 0.0, 0.35, z);
  for (const z of [-0.2, 0.2]) addCyl(g, 0.025, 0.025, h - 0.3, 0xa7adb3, W / 2 + 0.05, 0.4, z, 5);
  return g;
};

const sandbags: Builder = (def, W) => {
  const g = new THREE.Group();
  const bag = 0xb59d6a;
  const rows = 4;
  const nest = variantOf(def) === 'nest';
  const run = (len: number, ox: number, oz: number, rotY: number) => {
    const line = new THREE.Group();
    const per = Math.max(2, Math.round(len / 0.5));
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.25;
      for (let i = 0; i < per; i++) {
        const x = -len / 2 + off + 0.25 + i * (len / per);
        const b = addBox(line, 0.52, 0.24, 0.36, new THREE.Color(bag).multiplyScalar(0.9 + ((i * 7 + r * 3) % 5) * 0.03).getHex(), x, r * 0.23, 0);
        b.rotation.y = ((i * 13 + r * 5) % 7 - 3) * 0.03;
      }
    }
    line.position.set(ox, 0, oz);
    line.rotation.y = rotY;
    g.add(line);
  };
  if (nest) {
    run(W - 0.2, 0, -0.6, 0);
    run(1.4, -W / 2 + 0.35, 0.1, Math.PI / 2);
    run(1.4, W / 2 - 0.35, 0.1, Math.PI / 2);
    addBox(g, 0.5, 0.06, 0.5, DARK, 0, 0, 0.3);
    addCyl(g, 0.03, 0.03, 0.6, DARK, 0, 0.06, 0.3, 5);
  } else {
    run(1.9, 0, 0, 0);
  }
  return g;
};

const gate: Builder = (def, W) => {
  const g = new THREE.Group();
  const col = col1(def);
  const v = variantOf(def);
  const postH = v === 'steel' ? 2.6 : 2.2;
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) addBox(g, 0.24, postH, 0.24, v === 'steel' ? 0x3a424b : 0x6b4a2b, x, 0, 0);
  const leafW = W / 2 - 0.2;
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const lx = s * (leafW / 2 + 0.06);
    if (v === 'wood') {
      addBox(leaf, leafW, 0.12, 0.1, col, 0, 0.3, 0);
      addBox(leaf, leafW, 0.12, 0.1, col, 0, 1.6, 0);
      for (let i = 0; i < 5; i++) addBox(leaf, 0.2, 1.5, 0.06, col, -leafW / 2 + 0.2 + i * (leafW - 0.3) / 4, 0.25, 0.05);
      const brace = addBox(leaf, leafW * 1.05, 0.1, 0.05, 0x6e5436, 0, 0.9, 0.09);
      brace.rotation.z = s * 0.7;
    } else if (v === 'chain') {
      addBox(leaf, leafW, 0.06, 0.06, STEEL, 0, 0.25, 0);
      addBox(leaf, leafW, 0.06, 0.06, STEEL, 0, 1.75, 0);
      for (const x of [-leafW / 2, leafW / 2]) addBox(leaf, 0.06, 1.6, 0.06, STEEL, x, 0.2, 0);
      addBox(leaf, leafW - 0.1, 1.5, 0.02, translucent(0xc4ccd4, 0.5), 0, 0.28, 0);
    } else {
      addBox(leaf, leafW, 2.1, 0.14, col, 0, 0.25, 0);
      for (const y of [0.55, 1.4, 2.0]) addBox(leaf, leafW, 0.1, 0.2, 0x353d46, 0, y, 0);
      addBox(leaf, leafW, 0.14, 0.2, 0xd8a31c, 0, 0.3, 0);
      addBox(leaf, 0.1, 0.5, 0.22, 0xb9c0c7, -s * 0.2, 1.0, 0);
    }
    leaf.position.set(lx, 0, 0);
    g.add(leaf);
  }
  if (v === 'steel') addBox(g, 0.7, 0.14, 0.26, 0x5a6470, 0, 1.15, 0);
  return g;
};

// ------------------------------------------------------------------ Houses

const house: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const wallC = col1(def);
  const roofC = col2(def);
  const v = variantOf(def);
  const base = 0.3;
  addBox(g, W + 0.2, base, D + 0.2, 0x77716a, 0, 0, 0);

  if (v === 'prefab') {
    const h = 3.0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, h, D - 0.2), [corrugated(wallC, D), corrugated(wallC, D), mat(0x8a8f95), mat(0x333333), corrugated(wallC, W), corrugated(wallC, W)]);
    body.position.y = base + h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    addBox(g, W, 0.22, D, roofC, 0, base + h, 0);
    for (const x of [-W / 4, W / 4]) windowAt(g, x, base + 1.3, D / 2 - 0.1, 1.2, 0.9, 'front');
    addBox(g, 0.9, 2.1, 0.12, DARK, 0, base, D / 2 - 0.08);
    addCyl(g, 0.12, 0.12, 0.9, 0x555a5f, W / 3, base + h + 0.2, -D / 4, 8);
    for (let i = 0; i < 3; i++) addBox(g, 0.9, 0.05, 0.7, 0x1e3a5f, -W / 4 + i * 1.0, base + h + 0.3, -0.2).rotation.x = -0.3;
    return g;
  }

  if (v === 'cabin') {
    const h = 2.7;
    for (let row = 0; row < 9; row++) {
      const shade = row % 2 ? 0.88 : 1;
      addBox(g, W - 0.4 + (row % 2) * 0.12, h / 9 + 0.01, D - 0.4 + (row % 2) * 0.12, new THREE.Color(wallC).multiplyScalar(shade).getHex(), 0, base + row * (h / 9), 0);
    }
    const roof = pitchedRoof(W - 0.4, D - 0.4, 1.9, roofC, 0.6);
    roof.position.y = base + h;
    g.add(roof);
    addBox(g, 0.8, 3.4, 0.8, 0x77736b, W / 3, base, -D / 5 + 0.2);
    addBox(g, 0.95, 2.1, 0.12, 0x4b3322, 0, base, D / 2 - 0.12);
    addBox(g, 1.9, 0.18, 1.2, 0x6e5436, 0, base, D / 2 + 0.45);
    windowAt(g, -W / 3, base + 1.3, D / 2 - 0.15, 0.9, 0.8, 'front');
    windowAt(g, W / 3 + 0.2, base + 1.3, D / 2 - 0.15, 0.9, 0.8, 'front');
    return g;
  }

  // family and large houses
  const floors = v === 'large' ? 2 : 1;
  const floorH = 2.9;
  const bw = W - 0.3;
  const bd = D - 0.3;
  addBox(g, bw, floorH, bd, wallC, 0, base, 0);
  if (floors === 2) {
    addBox(g, bw - 0.4, floorH, bd - 0.4, wallC, 0, base + floorH, 0);
    addBox(g, bw + 0.15, 0.14, bd + 0.15, 0xe8e4da, 0, base + floorH - 0.05, 0);
  }
  const top = base + floorH * floors;
  const roof = pitchedRoof(bw - (floors === 2 ? 0.4 : 0), bd - (floors === 2 ? 0.4 : 0), v === 'large' ? 2.6 : 2.3, roofC, 0.45);
  roof.position.y = top;
  g.add(roof);
  addBox(g, 0.9, 2.2, 0.9, 0x8a5a4a, bw / 3, top - 0.4, -bd / 5);
  addBox(g, 1.0, 2.2, 0.14, 0x5b3a29, -bw / 4, base, bd / 2 + 0.03);
  addBox(g, 2.2, 0.2, 1.2, 0x8a8580, -bw / 4, 0, bd / 2 + 0.6);
  const cols = v === 'large' ? 3 : 2;
  for (let i = 0; i < cols; i++) {
    const x = bw * (0.05 + i * 0.28) - (cols === 3 ? 0.4 : 0.1);
    windowAt(g, x, base + 1.3, bd / 2, 1.2, 1.2, 'front');
    if (floors === 2) windowAt(g, x - 0.2, base + floorH + 1.3, bd / 2 - 0.2, 1.1, 1.2, 'front');
  }
  for (const s of ['left', 'right'] as const) windowAt(g, s === 'left' ? -bw / 2 : bw / 2, base + 1.3, 0, 1.2, 1.2, s);
  return g;
};

const tent: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const col = col1(def);
  const roof = pitchedRoof(W - 0.6, D - 0.6, 2.2, col, 0.1);
  g.add(roof);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.7), new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.55), side: THREE.DoubleSide }));
  flap.position.set(0, 0.95, (D - 0.6) / 2 + 0.2);
  g.add(flap);
  for (const x of [-1, 1]) addCyl(g, 0.04, 0.04, 2.3, 0x6b5a3a, x * (W / 2 - 0.2), 0, D / 2 - 0.1, 5);
  return g;
};

const bunker: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.34, W * 0.5, 1.5, 4).rotateY(Math.PI / 4), mat(0x5d8a45, 0.95));
  mound.position.y = 0.75;
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);
  addBox(g, W * 0.55, 1.55, 0.4, col1(def), 0, 0, D / 2 - 0.55);
  addBox(g, 1.3, 1.9, 1.1, col1(def), 0, 0, D / 2 - 0.9);
  addBox(g, 0.9, 1.5, 0.12, 0x3a4048, 0, 0, D / 2 - 0.34);
  addCyl(g, 0.12, 0.12, 1.2, 0x4d5560, -W / 4, 1.2, -0.5, 8);
  addCyl(g, 0.12, 0.12, 1.0, 0x4d5560, W / 4, 1.2, -0.2, 8);
  return g;
};

// ------------------------------------------------------------------ Water and power

const well: Builder = (def) => {
  const g = new THREE.Group();
  if (variantOf(def) === 'deep') {
    addBox(g, 1.8, 0.12, 1.8, 0x9a9a95, 0, 0, 0);
    addBox(g, 1.0, 1.1, 0.9, 0x6d7782, -0.3, 0.12, -0.2);
    const roof = pitchedRoof(1.0, 0.9, 0.4, 0x3d4650, 0.1);
    roof.position.set(-0.3, 1.22, -0.2);
    g.add(roof);
    addCyl(g, 0.22, 0.22, 1.1, 0x3a7ab0, 0.55, 0.12, 0.3, 10).rotation.z = 0;
    addCyl(g, 0.05, 0.05, 0.8, 0xb9c0c7, 0.3, 0.45, 0.1, 6).rotation.z = Math.PI / 2;
    return g;
  }
  addCyl(g, 0.82, 0.86, 0.85, 0x9c9a92, 0, 0, 0, 12);
  addCyl(g, 0.9, 0.9, 0.12, 0x8a8880, 0, 0.85, 0, 12);
  addCyl(g, 0.64, 0.64, 0.02, 0x14232c, 0, 0.93, 0, 12);
  for (const x of [-0.75, 0.75]) addBox(g, 0.12, 1.9, 0.12, 0x6b4a2b, x, 0.85, 0);
  const roof = pitchedRoof(1.8, 1.0, 0.5, 0x7a3b2e, 0.15);
  roof.position.y = 2.75;
  g.add(roof);
  addBox(g, 1.7, 0.1, 0.1, 0x6b4a2b, 0, 2.55, 0);
  addCyl(g, 0.12, 0.1, 0.22, 0x8a6b45, 0.15, 1.35, 0, 8);
  addBox(g, 0.02, 0.9, 0.02, 0xcfc2a0, 0.15, 1.6, 0);
  // hand pump on the rim
  addCyl(g, 0.05, 0.05, 0.9, 0x3a3f45, 0.7, 0.9, 0.55, 6);
  const handle = addBox(g, 0.7, 0.05, 0.05, 0x3a3f45, 0.55, 1.75, 0.55);
  handle.rotation.z = 0.35;
  return g;
};

const tank: Builder = (def) => {
  const g = new THREE.Group();
  const col = col1(def);
  if (variantOf(def) === 'tower') {
    for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) addBox(g, 0.14, 3.6, 0.14, 0x59626b, x, 0, z);
    for (const y of [0.9, 2.1]) {
      addBox(g, 1.5, 0.07, 0.07, 0x59626b, 0, y, 0.7);
      addBox(g, 1.5, 0.07, 0.07, 0x59626b, 0, y, -0.7);
    }
    addCyl(g, 1.0, 1.0, 1.9, col, 0, 3.6, 0, 14);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(col));
    dome.position.y = 5.5;
    dome.castShadow = true;
    g.add(dome);
    addBox(g, 0.08, 3.6, 0.3, 0x8a9199, 1.0, 0, 0);
    return g;
  }
  addCyl(g, 0.82, 0.82, 1.9, col, 0, 0.1, 0, 14);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(col));
  dome.position.y = 2.0;
  dome.castShadow = true;
  g.add(dome);
  for (const y of [0.6, 1.4]) addCyl(g, 0.85, 0.85, 0.06, 0x1f4d73, 0, y, 0, 14);
  addCyl(g, 0.05, 0.05, 0.3, 0xb9c0c7, 0.75, 0.3, 0.3, 6).rotation.z = Math.PI / 2;
  return g;
};

const rain: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.5, 0.5, 1.2, 0x2f6f8f, 0, 0.1, 0, 12);
  addCyl(g, 0.52, 0.52, 0.05, 0x1c3f52, 0, 1.3, 0, 12);
  addBox(g, 0.12, 1.6, 0.12, 0x6b4a2b, -0.7, 0, -0.5);
  addBox(g, 1.5, 0.08, 0.5, 0x5b6770, -0.1, 1.55, -0.5).rotation.z = -0.1;
  return g;
};

const filter: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.6, 0.1, 1.2, 0x9a9a95, 0, 0, 0);
  addBox(g, 1.2, 1.1, 0.7, 0xe1e6ea, 0, 0.1, -0.15);
  for (const x of [-0.45, 0, 0.45]) addCyl(g, 0.17, 0.17, 1.0, 0x2f8fd0, x, 0.1, 0.45, 10);
  addCyl(g, 0.04, 0.04, 1.3, 0xb9c0c7, 0, 1.15, 0.45, 6).rotation.z = Math.PI / 2;
  addBox(g, 0.3, 0.3, 0.05, 0x22262b, 0.4, 0.8, 0.22);
  return g;
};

const solar: Builder = (def, W) => {
  const g = new THREE.Group();
  const cells = variantOf(def) === 'array' ? { cols: 3, rows: 2 } : { cols: 1, rows: 1 };
  const pw = variantOf(def) === 'array' ? 1.1 : 1.6;
  const pd = variantOf(def) === 'array' ? 1.7 : 1.3;
  for (let r = 0; r < cells.rows; r++) {
    for (let c = 0; c < cells.cols; c++) {
      const panel = new THREE.Group();
      addBox(panel, pw, 0.06, pd, 0x1b3a63, 0, 0, 0);
      addBox(panel, pw + 0.06, 0.04, 0.05, 0xc7ced4, 0, 0.02, pd / 2);
      addBox(panel, pw + 0.06, 0.04, 0.05, 0xc7ced4, 0, 0.02, -pd / 2);
      for (let i = 1; i < 3; i++) addBox(panel, 0.015, 0.02, pd, 0x7d93b3, -pw / 2 + i * pw / 3, 0.065, 0);
      addBox(panel, pw, 0.02, 0.015, 0x7d93b3, 0, 0.065, 0);
      panel.rotation.x = -0.5;
      panel.position.set((c - (cells.cols - 1) / 2) * (pw + 0.1), 0.8, (r - (cells.rows - 1) / 2) * (pd * 0.85 + 0.15));
      g.add(panel);
    }
  }
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) addBox(g, 0.08, 0.8, 0.08, 0x8a929a, x, 0, 0);
  addBox(g, W - 0.4, 0.06, 0.06, 0x8a929a, 0, 0.35, 0);
  return g;
};

const turbine: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.1, 0.22, 7.2, 0xe8ebee, 0, 0, 0, 10);
  addBox(g, 0.4, 0.4, 0.9, 0xd9dde0, 0, 7.1, 0.1);
  const rotor = new THREE.Group();
  rotor.position.set(0, 7.3, 0.6);
  addCyl(rotor, 0.14, 0.14, 0.2, 0xb9bfc5, 0, -0.1, 0, 8).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Group();
    addBox(blade, 0.16, 2.6, 0.04, 0xf2f4f5, 0, 0.1, 0);
    blade.rotation.z = (i * Math.PI * 2) / 3 + 0.3;
    rotor.add(blade);
  }
  rotor.userData.spin = true;
  g.add(rotor);
  return g;
};

const generator: Builder = (def) => {
  const g = new THREE.Group();
  const big = variantOf(def) === 'large';
  const s = big ? 1.35 : 1;
  addBox(g, 1.5 * s, 0.1, 1.0 * s, 0x2b2f33, 0, 0, 0);
  addBox(g, 1.3 * s, 0.9 * s, 0.8 * s, col1(def), 0, 0.1, 0);
  for (let i = 0; i < 4; i++) addBox(g, 0.5 * s, 0.04, 0.02, DARK, -0.25 * s, 0.35 + i * 0.12, 0.41 * s);
  addBox(g, 0.4 * s, 0.3 * s, 0.35 * s, 0x34383c, 0.35 * s, 1.0 * s, 0);
  addCyl(g, 0.05, 0.05, 0.6 * s, 0x555a5f, -0.5 * s, 1.0 * s, -0.2 * s, 6);
  addBox(g, 0.2, 0.15, 0.04, 0xf2c200, 0.3 * s, 0.55, 0.42 * s);
  return g;
};

const battery: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.7, 0.1, 1.0, 0x2b2f33, 0, 0, 0);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      addBox(g, 0.5, 0.5, 0.8, row ? 0x2f6f4f : 0x2d5a9e, -0.55 + i * 0.55, 0.12 + row * 0.55, 0);
      addCyl(g, 0.05, 0.05, 0.05, 0xd0d0d0, -0.65 + i * 0.55, 0.62 + row * 0.55, 0.2, 6);
      addCyl(g, 0.05, 0.05, 0.05, 0xc0392b, -0.45 + i * 0.55, 0.62 + row * 0.55, 0.2, 6);
    }
  }
  addBox(g, 1.7, 0.06, 0.06, 0x8a929a, 0, 1.2, 0.45);
  return g;
};

// ------------------------------------------------------------------ Farming

const greenhouse: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const w = W - 0.4;
  const d = D - 0.4;
  const h = variantOf(def) === 'large' ? 2.6 : 2.2;
  addBox(g, w + 0.1, 0.35, d + 0.1, 0x8a8f94, 0, 0, 0);
  const glass = translucent(0xbfe8e0, 0.32);
  addBox(g, w, h - 0.35, d, glass, 0, 0.35, 0);
  const roof = pitchedRoof(w, d, 1.2, 0xbfe8e0, 0.05);
  roof.material = glass;
  roof.position.y = h;
  g.add(roof);
  // Frame
  const posts = Math.max(2, Math.round(d / 1.5) + 1);
  for (let i = 0; i < posts; i++) {
    const z = -d / 2 + (d * i) / (posts - 1);
    for (const x of [-w / 2, w / 2]) addBox(g, 0.07, h - 0.35, 0.07, 0xe8ebee, x, 0.35, z);
    addBox(g, w, 0.05, 0.05, 0xe8ebee, 0, h, z);
  }
  // Plants inside
  const rows = Math.max(2, Math.round(w / 1.1));
  for (let r = 0; r < rows; r++) {
    const x = -w / 2 + 0.5 + (r * (w - 1)) / (rows - 1);
    addBox(g, 0.5, 0.2, d - 0.6, 0x5b3d26, x, 0.35, 0);
    for (let k = 0; k < Math.round(d - 0.6); k++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0x4aa84a));
      blob.position.set(x, 0.75, -d / 2 + 0.5 + k * 0.9);
      g.add(blob);
    }
  }
  return g;
};

const garden: Builder = (_def, W) => {
  const g = new THREE.Group();
  addBox(g, W - 0.2, 0.35, 1.2, 0x8a6b45, 0, 0, 0);
  addBox(g, W - 0.4, 0.06, 1.0, 0x4b3322, 0, 0.32, 0);
  for (let i = 0; i < 5; i++) {
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(i % 2 ? 0x4aa84a : 0x6dbf4a));
    plant.position.set(-W / 2 + 0.55 + i * 0.7, 0.55, (i % 2) * 0.2 - 0.1);
    plant.castShadow = true;
    g.add(plant);
    if (i % 2) {
      const tomato = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(0xd23b2a));
      tomato.position.set(plant.position.x + 0.1, 0.5, plant.position.z + 0.15);
      g.add(tomato);
    }
  }
  return g;
};

const coop: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  addBox(g, 1.5, 1.1, 1.2, 0xb5482a, -W / 4, 0.4, 0);
  for (const x of [-W / 4 - 0.55, -W / 4 + 0.55]) addBox(g, 0.1, 0.4, 0.1, 0x6b4a2b, x, 0, 0.45);
  const roof = pitchedRoof(1.5, 1.2, 0.5, 0x5a4636, 0.15);
  roof.position.set(-W / 4, 1.5, 0);
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  addBox(g, 0.4, 0.55, 0.05, 0x2b2f33, -W / 4, 0.45, 0.62);
  addBox(g, 0.5, 0.05, 0.6, 0x8a6b45, -W / 4, 0.15, 0.9).rotation.x = 0.4;
  addBox(g, 1.4, 0.8, 0.03, translucent(0xc4ccd4, 0.5), W / 4 - 0.1, 0, D / 2 - 0.1);
  for (const [x, z] of [[0.4, 0.2], [0.9, -0.2]]) {
    addBox(g, 0.28, 0.22, 0.2, 0xf0e9dc, W / 4 - 0.1 + x - 0.4, 0.05, z);
    addBox(g, 0.1, 0.12, 0.08, 0xd9352a, W / 4 - 0.1 + x - 0.4, 0.27, z + 0.04);
  }
  return g;
};

const orchard: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  addBox(g, W - 0.4, 0.06, D - 0.4, 0x6f5a3a, 0, 0, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (W / 4);
      const z = sz * (D / 4);
      addCyl(g, 0.1, 0.14, 1.0, 0x6b4a2b, x, 0.06, z, 6);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), mat(0x5fa042));
      crown.position.set(x, 1.5, z);
      crown.castShadow = true;
      g.add(crown);
      for (let i = 0; i < 4; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), mat(i % 2 ? 0xd23b2a : 0xe8c43a));
        fruit.position.set(x + Math.cos(i * 1.6) * 0.7, 1.35 + (i % 2) * 0.3, z + Math.sin(i * 1.6) * 0.7);
        g.add(fruit);
      }
    }
  }
  return g;
};

const hive: Builder = () => {
  const g = new THREE.Group();
  for (const x of [-0.3, 0.3]) addBox(g, 0.1, 0.35, 0.8, 0x6b4a2b, x, 0, 0);
  for (let i = 0; i < 3; i++) {
    addBox(g, 0.7, 0.28, 0.6, i === 1 ? 0xf2d56b : 0xf2eee0, 0, 0.35 + i * 0.28, 0);
    addBox(g, 0.5, 0.03, 0.02, DARK, 0, 0.4 + i * 0.28, 0.31);
  }
  addBox(g, 0.8, 0.07, 0.7, 0x8a8f94, 0, 1.2, 0);
  return g;
};

// ------------------------------------------------------------------ Defense

const tower: Builder = () => {
  const g = new THREE.Group();
  const h = 5.2;
  for (const x of [-0.75, 0.75]) for (const z of [-0.75, 0.75]) addBox(g, 0.18, h, 0.18, 0x6b4a2b, x, 0, z);
  for (const y of [1.2, 2.8, 4.2]) {
    addBox(g, 1.6, 0.09, 0.09, 0x5b3d26, 0, y, 0.75);
    addBox(g, 1.6, 0.09, 0.09, 0x5b3d26, 0, y, -0.75);
    addBox(g, 0.09, 0.09, 1.6, 0x5b3d26, 0.75, y, 0);
    addBox(g, 0.09, 0.09, 1.6, 0x5b3d26, -0.75, y, 0);
  }
  for (const s of [-1, 1]) {
    const brace = addBox(g, 0.08, 3.4, 0.08, 0x5b3d26, 0, 0.8, s * 0.75);
    brace.rotation.z = s * 0.4;
  }
  addBox(g, 2.2, 0.16, 2.2, 0x8a6b45, 0, h, 0);
  for (const s of [-1, 1]) {
    addBox(g, 2.2, 0.8, 0.08, 0x7a5a37, 0, h + 0.16, s * 1.06);
    addBox(g, 0.08, 0.8, 2.2, 0x7a5a37, s * 1.06, h + 0.16, 0);
  }
  for (const x of [-0.95, 0.95]) for (const z of [-0.95, 0.95]) addBox(g, 0.1, 1.4, 0.1, 0x5b3d26, x, h + 0.16, z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 4).rotateY(Math.PI / 4), mat(0x5a4636));
  roof.position.y = h + 1.9;
  roof.castShadow = true;
  g.add(roof);
  addBox(g, 0.1, 5.0, 0.35, 0x6b4a2b, 0.95, 0, 0.95);
  return g;
};

const floodlight: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.08, 0.14, 6.0, 0x59626b, 0, 0, 0, 8);
  addBox(g, 1.3, 0.1, 0.12, 0x3a4048, 0, 5.9, 0);
  for (const x of [-0.45, 0.45]) {
    addBox(g, 0.5, 0.35, 0.2, 0x2b2f33, x, 5.7, 0.1);
    addBox(g, 0.42, 0.27, 0.05, lampBulbMat, x, 5.74, 0.22);
  }
  return g;
};

const spikes: Builder = (_def, W) => {
  const g = new THREE.Group();
  addBox(g, W - 0.2, 0.08, 1.4, 0x4a3b2a, 0, 0, 0);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 5), mat(0xa9b0b7));
      spike.position.set(-0.8 + i * 0.27, 0.43, -0.45 + r * 0.45);
      spike.castShadow = true;
      g.add(spike);
    }
  }
  return g;
};

const trench: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  addBox(g, W - 0.3, 0.02, D - 1.1, 0x1c150f, 0, 0.03, 0);
  for (const s of [-1, 1]) addBox(g, W - 0.2, 0.4, 0.45, 0x6b5338, 0, 0, s * (D / 2 - 0.4));
  for (let i = 0; i < 9; i++) {
    const stake = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), mat(0x7a5a37));
    stake.position.set(-W / 2 + 0.5 + i * ((W - 1) / 8), 0.24, 0);
    g.add(stake);
  }
  return g;
};

// ------------------------------------------------------------------ Storage and utility

const crates: Builder = () => {
  const g = new THREE.Group();
  const crate = (x: number, y: number, z: number, s: number, rot: number) => {
    const c = new THREE.Group();
    addBox(c, s, s, s, 0xa57a46, 0, 0, 0);
    addBox(c, s + 0.06, 0.1, s + 0.06, 0x7d5a32, 0, 0.02, 0);
    addBox(c, s + 0.06, 0.1, s + 0.06, 0x7d5a32, 0, s - 0.12, 0);
    for (const dx of [-s / 2 + 0.06, s / 2 - 0.06]) addBox(c, 0.1, s + 0.02, s + 0.06, 0x7d5a32, dx, 0, 0);
    c.position.set(x, y, z);
    c.rotation.y = rot;
    g.add(c);
  };
  crate(-0.4, 0, -0.3, 0.9, 0.1);
  crate(0.5, 0, -0.2, 0.8, -0.2);
  crate(-0.1, 0.9, -0.3, 0.8, 0.3);
  crate(0.3, 0, 0.55, 0.7, 0.5);
  return g;
};

const shed: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  addBox(g, W - 0.4, 2.3, D - 0.4, 0x8a6b45, 0, 0.1, 0);
  const roof = pitchedRoof(W - 0.4, D - 0.4, 0.9, 0x4f5a66, 0.3);
  roof.position.y = 2.4;
  g.add(roof);
  addBox(g, 1.1, 1.9, 0.1, 0x5b3d26, 0, 0.1, D / 2 - 0.16);
  windowAt(g, W / 2 - 0.15, 1.3, 0, 0.8, 0.7, 'right');
  addBox(g, 0.1, 1.3, 0.1, 0x6b4a2b, -W / 2 + 0.45, 0, D / 2 - 0.1).rotation.z = 0.15;
  return g;
};

const warehouse: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  const h = 4.8;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, h, D - 0.6), [corrugated(0xb8bcc0, D), corrugated(0xb8bcc0, D), mat(0x6d7379), mat(0x333333), corrugated(0xb8bcc0, W), corrugated(0xb8bcc0, W)]);
  body.position.y = 0.2 + h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // The roof is built running along z. Turn it about the middle of the building (not about its own corner, which
  // pushed the whole roof several meters off the walls).
  const roof = pitchedRoof(D - 0.6, W - 0.6, 1.1, 0x4f5a66, 0.35);
  const roofPivot = new THREE.Group();
  roofPivot.add(roof);
  roofPivot.rotation.y = Math.PI / 2;
  roofPivot.position.y = 0.2 + h;
  g.add(roofPivot);
  addBox(g, 3.0, 3.4, 0.12, 0xdfe3e6, 0, 0.2, D / 2 - 0.34);
  for (let i = 0; i < 6; i++) addBox(g, 3.0, 0.05, 0.16, 0xa7adb3, 0, 0.5 + i * 0.55, D / 2 - 0.3);
  for (const x of [-W / 3, W / 3]) windowAt(g, x, 3.4, D / 2 - 0.34, 1.2, 0.6, 'front');
  addBox(g, 1.0, 0.5, 1.0, 0x8a929a, W / 4, 0.2 + h + 0.7, 0);
  return g;
};

const workbench: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.7, 0.1, 0.8, 0x8a6b45, 0, 0.85, 0);
  for (const x of [-0.75, 0.75]) for (const z of [-0.3, 0.3]) addBox(g, 0.1, 0.85, 0.1, 0x6b4a2b, x, 0, z);
  addBox(g, 1.6, 0.06, 0.7, 0x6b4a2b, 0, 0.25, 0);
  addBox(g, 0.25, 0.2, 0.2, 0x3a4048, 0.55, 0.95, 0);
  addBox(g, 0.5, 0.06, 0.12, 0xb9c0c7, -0.4, 0.95, 0.1);
  addBox(g, 0.1, 0.22, 0.1, 0xc0392b, -0.1, 0.95, -0.15);
  return g;
};

const kitchen: Builder = (_def, W) => {
  const g = new THREE.Group();
  addBox(g, W - 0.4, 0.85, 0.9, 0xcfd4d8, 0, 0, 0);
  addBox(g, W - 0.3, 0.08, 1.0, 0x6b6f73, 0, 0.85, 0);
  addBox(g, 0.9, 0.06, 0.7, DARK, -0.7, 0.93, 0);
  for (const x of [-0.95, -0.45]) addCyl(g, 0.14, 0.14, 0.02, 0x555a5f, x, 0.99, 0, 10);
  addCyl(g, 0.12, 0.1, 0.22, 0xb9c0c7, -0.95, 1.0, 0, 8);
  addBox(g, 0.7, 0.06, 0.5, 0x8a6b45, 0.9, 0.93, 0);
  addCyl(g, 0.07, 0.07, 1.4, 0x555a5f, -1.2, 0.85, -0.3, 6);
  return g;
};

const mast: Builder = () => {
  const g = new THREE.Group();
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) addBox(g, 0.07, 8.6, 0.07, 0xd9dde0, x * (1 - 0.0), 0, z);
  for (let i = 0; i < 8; i++) {
    const y = 0.4 + i * 1.05;
    addBox(g, 0.75, 0.04, 0.04, 0xc0392b, 0, y, 0.35);
    addBox(g, 0.75, 0.04, 0.04, 0xf2f2ee, 0, y, -0.35);
    addBox(g, 0.04, 0.04, 0.75, 0xf2f2ee, 0.35, y, 0);
    addBox(g, 0.04, 0.04, 0.75, 0xc0392b, -0.35, y, 0);
  }
  addCyl(g, 0.4, 0.05, 0.25, 0xe8ebee, 0.35, 8.2, 0.35, 12).rotation.x = Math.PI / 3;
  addCyl(g, 0.03, 0.03, 1.6, 0xb9c0c7, 0, 8.6, 0, 5);
  addBox(g, 1.0, 0.1, 1.0, 0x9a9a95, 0, 0, 0);
  return g;
};

const bunk: Builder = (_def, W) => {
  const g = new THREE.Group();
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-0.45, 0.45]) addBox(g, 0.1, 1.9, 0.1, 0x6b4a2b, x, 0, z);
  for (const [y, c] of [[0.3, 0x3f6fa5], [1.25, 0xa54a3f]] as const) {
    addBox(g, W - 0.5, 0.1, 1.0, 0x8a6b45, 0, y, 0);
    addBox(g, W - 0.7, 0.16, 0.85, c, 0, y + 0.1, 0);
    addBox(g, 0.5, 0.14, 0.6, 0xf2eee0, -W / 2 + 0.6, y + 0.26, 0);
  }
  return g;
};

const lamp: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.06, 0.1, 4.6, 0x3d4349, 0, 0, 0, 6);
  addBox(g, 0.9, 0.1, 0.16, 0x3d4349, 0.35, 4.5, 0);
  addBox(g, 0.4, 0.1, 0.3, lampBulbMat, 0.75, 4.42, 0);
  return g;
};

/** A wooden utility pole with a crossbar and insulators. */
const pole: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.11, 0.16, 5.2, 0x6b4a2b, 0, 0, 0, 7);
  addBox(g, 1.5, 0.12, 0.14, 0x5a3e24, 0, 4.7, 0);
  addBox(g, 1.0, 0.1, 0.12, 0x5a3e24, 0, 4.0, 0);
  for (const x of [-0.65, 0, 0.65]) addCyl(g, 0.05, 0.05, 0.2, 0xd9d3c3, x, 4.78, 0, 6);
  addBox(g, 0.34, 0.5, 0.2, 0x7d858c, 0.22, 2.2, 0.14);
  return g;
};

/** A short blue standpipe with a valve wheel, standing on a concrete pad. */
const pipe: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 0.9, 0.12, 0.9, 0xa7a7a1, 0, 0, 0);
  addCyl(g, 0.17, 0.17, 1.5, 0x2f7fb8, 0, 0.12, 0, 10);
  addCyl(g, 0.24, 0.24, 0.14, 0x2a6a9a, 0, 1.55, 0, 10);
  const side = addCyl(g, 0.1, 0.1, 0.7, 0x2f7fb8, 0.3, 0.9, 0, 8);
  side.rotation.z = Math.PI / 2;
  const wheel = addCyl(g, 0.22, 0.22, 0.05, 0xd9352a, 0, 1.75, 0, 12);
  wheel.position.y = 1.72;
  addBox(g, 0.5, 0.12, 0.5, 0x7d858c, 0, 0.5, 0);
  return g;
};

const medical: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  const roof = pitchedRoof(W - 0.4, D - 0.4, 1.4, 0xf2f2ee, 0.1);
  roof.position.y = 1.9;
  g.add(roof);
  addBox(g, W - 0.5, 1.9, D - 0.5, 0xe9ebe6, 0, 0.05, 0);
  addBox(g, 0.9, 0.28, 0.04, 0xd9352a, 0, 2.4, D / 2 - 0.2);
  addBox(g, 0.28, 0.9, 0.04, 0xd9352a, 0, 2.1, D / 2 - 0.2);
  addBox(g, 1.0, 1.7, 0.06, 0x2b2f33, 0, 0.05, D / 2 - 0.24);
  for (const x of [-W / 4, W / 4]) addBox(g, 0.7, 0.12, 1.6, 0xa7b8c9, x, 0.4, -0.3);
  return g;
};

const fueltank: Builder = () => {
  const g = new THREE.Group();
  for (const x of [-0.55, 0.55]) addBox(g, 0.12, 0.45, 1.0, 0x3a4048, x, 0, 0);
  const tankMesh = addCyl(g, 0.55, 0.55, 2.0, 0xb23a32, 0, 0.5, 0, 14);
  tankMesh.rotation.z = Math.PI / 2;
  tankMesh.position.y = 1.0;
  addCyl(g, 0.12, 0.12, 0.2, 0x555a5f, 0, 1.55, 0, 8);
  addBox(g, 0.5, 0.3, 0.02, 0xf2c200, 0, 1.0, 0.56);
  return g;
};

// ------------------------------------------------------------------ Ponds, trees, paths and garden features

const fireMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e });
const fireCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });

/** Small deterministic random generator so a model always looks the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function blobShape(rx: number, rz: number, seed: number, scale = 1): THREE.Shape {
  const shape = new THREE.Shape();
  const phase = seed * 1.7;
  const n = 44;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 1 + 0.1 * Math.sin(a * 3 + phase) + 0.06 * Math.sin(a * 5 + phase * 2);
    const x = Math.cos(a) * rx * wobble * scale;
    const y = Math.sin(a) * rz * wobble * scale;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function flatShape(shape: THREE.Shape, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

const pond: Builder = (def, W, D) => {
  const g = new THREE.Group();
  const v = variantOf(def);
  const seed = v === 'small' ? 1 : v === 'large' ? 2 : 3;
  const rnd = seeded(seed * 97);
  const rx = W / 2 - 0.45;
  const rz = D / 2 - 0.45;
  g.add(flatShape(blobShape(rx, rz, seed, 1.12), mat(0x6b5a3a, 1), 0.03));
  g.add(flatShape(blobShape(rx, rz, seed), new THREE.MeshStandardMaterial({ color: 0x2f86ae, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.92 }), 0.07));
  g.add(flatShape(blobShape(rx, rz, seed, 0.6), new THREE.MeshStandardMaterial({ color: 0x1f5f86, roughness: 0.15, transparent: true, opacity: 0.8 }), 0.075));

  // Stones on the bank, reeds and lily pads
  const count = Math.round((rx + rz) * 3.2);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
    const wobble = 1 + 0.1 * Math.sin(a * 3 + seed * 1.7) + 0.06 * Math.sin(a * 5 + seed * 3.4);
    const px = Math.cos(a) * rx * wobble * 1.1;
    const pz = -Math.sin(a) * rz * wobble * 1.1;
    const r = 0.14 + rnd() * 0.16;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(rnd() > 0.5 ? 0x8d9094 : 0x77797d));
    stone.scale.y = 0.65;
    stone.position.set(px, r * 0.66, pz); // sits on the ground, not in it
    g.add(stone);
    if (i % 4 === 0) {
      for (let k = 0; k < 3; k++) {
        const h = 0.7 + rnd() * 0.6;
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), mat(k % 2 ? 0x6f8f3a : 0x8a9a45));
        reed.position.set(px * 0.96 + (k - 1) * 0.08, h / 2, pz * 0.96 + rnd() * 0.1);
        reed.rotation.z = (rnd() - 0.5) * 0.3;
        g.add(reed);
      }
    }
  }
  if (v !== 'small') {
    for (let i = 0; i < 6; i++) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.22 + rnd() * 0.12, 10), mat(0x4d9a4a));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((rnd() - 0.5) * rx * 1.1, 0.09, (rnd() - 0.5) * rz * 1.1);
      g.add(pad);
      if (i % 3 === 0) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(0xf0a0c0));
        flower.position.set(pad.position.x, 0.14, pad.position.z);
        g.add(flower);
      }
    }
  }
  if (v === 'fish') {
    for (let i = 0; i < 5; i++) {
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(i % 2 ? 0xf08a2a : 0xe8c43a));
      fish.scale.set(1.8, 0.6, 0.8);
      fish.position.set((rnd() - 0.5) * rx * 0.9, 0.095, (rnd() - 0.5) * rz * 0.9);
      fish.rotation.y = rnd() * 6;
      g.add(fish);
    }
    // A short wooden jetty
    addBox(g, 0.7, 0.08, 2.2, 0x8a6b45, 0, 0.18, D / 2 - 1.2);
    for (const x of [-0.3, 0.3]) addBox(g, 0.08, 0.5, 0.08, 0x6b4a2b, x, 0, D / 2 - 0.3);
  }
  return g;
};

const tree: Builder = (def) => {
  const g = new THREE.Group();
  const v = variantOf(def);
  const crown = (r: number, x: number, y: number, z: number, color: number, sy = 1) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(color));
    m.position.set(x, y, z);
    m.scale.y = sy;
    g.add(m);
    return m;
  };
  if (v === 'pine') {
    addCyl(g, 0.16, 0.24, 1.5, 0x6b4a2b, 0, 0, 0, 6);
    for (const [r, h, y] of [[1.3, 2.2, 1.5], [1.0, 1.9, 2.7], [0.65, 1.5, 3.8]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(0x2f6b3a));
      cone.position.y = y + h / 2 - 0.2;
      g.add(cone);
    }
  } else if (v === 'birch') {
    addCyl(g, 0.1, 0.14, 3.0, 0xe8e6dc, 0, 0, 0, 6);
    for (const y of [0.5, 1.1, 1.7, 2.3]) addCyl(g, 0.105, 0.105, 0.07, 0x3a3a38, 0, y, 0, 6);
    crown(0.8, 0, 3.3, 0, 0x7dbb4a, 1.4);
    crown(0.55, 0.4, 2.6, 0.2, 0x8ccb55, 1.2);
  } else {
    addCyl(g, 0.2, 0.3, 1.9, 0x6b4a2b, 0, 0, 0, 7);
    crown(1.3, 0, 3.0, 0, v === 'apple' ? 0x5fa042 : 0x4f8f3a, 0.85);
    crown(0.95, 0.8, 3.6, 0.4, v === 'apple' ? 0x6dae4a : 0x5fa042);
    if (v === 'apple') {
      for (let i = 0; i < 7; i++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(0xd23b2a));
        const a = i * 0.9;
        fruit.position.set(Math.cos(a) * 1.1, 2.6 + (i % 3) * 0.35, Math.sin(a) * 1.0);
        g.add(fruit);
      }
    }
  }
  return g;
};

const hedge: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.95, 0.9, 0.7, 0x3a7338, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(i % 2 ? 0x4a8a44 : 0x3f7a3d));
    m.position.set(-0.8 + i * 0.4, 0.95, (i % 2) * 0.08 - 0.04);
    g.add(m);
  }
  return g;
};

const flowers: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.8, 0.14, 1.3, 0x5b3d26, 0, 0, 0);
  const palette = [0xe85a8a, 0xf2c200, 0xffffff, 0xa06ae0, 0xf08a2a];
  const rnd = seeded(5);
  for (let i = 0; i < 16; i++) {
    const stem = addBox(g, 0.03, 0.28, 0.03, 0x4d8a3a, -0.8 + rnd() * 1.6, 0.1, -0.55 + rnd() * 1.1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), mat(palette[i % palette.length]));
    head.position.set(stem.position.x, 0.46, stem.position.z);
    g.add(head);
  }
  return g;
};

const path: Builder = (def) => {
  const g = new THREE.Group();
  const v = variantOf(def);
  if (v === 'gravel') {
    addBox(g, 1.96, 0.05, 1.96, 0xb7ab94, 0, 0.01, 0);
    const rnd = seeded(9);
    for (let i = 0; i < 14; i++) addBox(g, 0.12, 0.05, 0.1, i % 2 ? 0x9a8f7a : 0xcfc3a8, -0.85 + rnd() * 1.7, 0.05, -0.85 + rnd() * 1.7);
  } else if (v === 'stone') {
    for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) addBox(g, 0.92, 0.07, 0.92, (x + z) % 2 ? 0x9a9a95 : 0x8a8a86, -0.48 + x * 0.96, 0.01, -0.48 + z * 0.96);
  } else {
    for (let i = 0; i < 5; i++) addBox(g, 1.96, 0.07, 0.36, i % 2 ? 0x8a6b45 : 0x7d5f3c, 0, 0.02, -0.8 + i * 0.4);
  }
  return g;
};

const firepit: Builder = () => {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), mat(i % 2 ? 0x8d9094 : 0x6f7276));
    stone.position.set(Math.cos(a) * 0.68, 0.15, Math.sin(a) * 0.68);
    stone.scale.y = 0.8;
    g.add(stone);
  }
  addCyl(g, 0.6, 0.6, 0.05, 0x2b2420, 0, 0, 0, 12);
  for (let i = 0; i < 3; i++) {
    const log = addCyl(g, 0.09, 0.09, 0.9, 0x5b3d26, 0, 0.12, 0, 6);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i * Math.PI) / 3;
    log.position.y = 0.16 + i * 0.03;
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 6), fireMat);
  flame.position.y = 0.55;
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), fireCoreMat);
  core.position.y = 0.45;
  g.add(core);
  return g;
};

const bench: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.7, 0.08, 0.5, 0x8a6b45, 0, 0.5, 0);
  addBox(g, 1.7, 0.45, 0.07, 0x8a6b45, 0, 0.62, -0.25);
  for (const x of [-0.7, 0.7]) addBox(g, 0.08, 0.5, 0.45, 0x4a4f55, x, 0, 0);
  return g;
};

const picnic: Builder = () => {
  const g = new THREE.Group();
  addBox(g, 1.9, 0.08, 0.8, 0x8a6b45, 0, 0.78, 0);
  for (const z of [-0.65, 0.65]) addBox(g, 1.9, 0.07, 0.3, 0x7d5f3c, 0, 0.45, z);
  for (const x of [-0.7, 0.7]) {
    const a = addBox(g, 0.08, 1.0, 0.08, 0x6b4a2b, x, 0, -0.25);
    a.rotation.x = 0.35;
    const b = addBox(g, 0.08, 1.0, 0.08, 0x6b4a2b, x, 0, 0.25);
    b.rotation.x = -0.35;
  }
  return g;
};

const flagpole: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.12, 0.15, 0.25, 0x77716a, 0, 0, 0, 8);
  addCyl(g, 0.04, 0.06, 5.2, 0xd9dde0, 0, 0.2, 0, 6);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), new THREE.MeshStandardMaterial({ color: 0xc0392b, side: THREE.DoubleSide }));
  flag.position.set(0.68, 4.8, 0);
  g.add(flag);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.25), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, side: THREE.DoubleSide }));
  stripe.position.set(0.68, 4.8, 0.01);
  g.add(stripe);
  return g;
};

const boulder: Builder = () => {
  const g = new THREE.Group();
  const big = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), mat(0x7d8084));
  big.scale.set(1.05, 0.75, 0.9);
  big.position.y = 0.66;
  big.rotation.y = 0.5;
  g.add(big);
  const small = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), mat(0x6f7276));
  small.position.set(0.8, 0.41, 0.5);
  g.add(small);
  return g;
};

const scarecrow: Builder = () => {
  const g = new THREE.Group();
  addCyl(g, 0.05, 0.05, 2.1, 0x6b4a2b, 0, 0, 0, 6);
  addBox(g, 1.5, 0.08, 0.08, 0x6b4a2b, 0, 1.45, 0);
  addBox(g, 0.5, 0.65, 0.25, 0x3f6fa5, 0, 0.95, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xe0c070));
  head.position.y = 1.85;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 7), mat(0x5b3d26));
  hat.position.y = 2.15;
  g.add(hat);
  addBox(g, 0.9, 0.04, 0.9, 0x5b3d26, 0, 2.0, 0);
  for (const x of [-0.7, 0.7]) addBox(g, 0.18, 0.28, 0.06, 0xe0c070, x, 1.2, 0);
  return g;
};

const windmill: Builder = () => {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 4.6, 8), mat(0xe9e2d0));
  tower.position.y = 2.3;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 8), mat(0x7a3b2e));
  cap.position.y = 5.15;
  g.add(cap);
  addBox(g, 0.7, 1.4, 0.1, 0x5b3d26, 0, 0, 0.98);
  const rotor = new THREE.Group();
  rotor.position.set(0, 4.7, 0.95);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    addBox(blade, 0.14, 2.6, 0.05, 0x8a6b45, 0, 0.2, 0);
    addBox(blade, 0.55, 1.8, 0.03, 0xf2eee0, 0.3, 0.6, 0.02);
    blade.rotation.z = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  addCyl(rotor, 0.12, 0.12, 0.3, 0x3a3f45, 0, -0.15, 0, 8).rotation.x = Math.PI / 2;
  rotor.userData.spin = true;
  g.add(rotor);
  return g;
};

const barn: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  const h = 4.2;
  addBox(g, W - 0.4, 0.3, D - 0.4, 0x77716a, 0, 0, 0);
  addBox(g, W - 0.6, h, D - 0.6, 0xa6342b, 0, 0.3, 0);
  const roof = pitchedRoof(W - 0.6, D - 0.6, 2.7, 0x4b4f55, 0.45);
  roof.position.y = 0.3 + h;
  g.add(roof);
  const dw = 3.4;
  addBox(g, dw, 3.2, 0.12, 0x8b2a23, 0, 0.3, D / 2 - 0.3);
  addBox(g, dw + 0.4, 0.14, 0.16, 0xf2f2ee, 0, 3.5, D / 2 - 0.28);
  for (const s of [-1, 1]) {
    addBox(g, 0.14, 3.5, 0.16, 0xf2f2ee, s * (dw / 2 + 0.1), 0.3, D / 2 - 0.28);
    const x1 = addBox(g, 0.12, 3.9, 0.1, 0xf2f2ee, s * dw / 4, 0.3, D / 2 - 0.2);
    x1.rotation.z = s * 0.7;
  }
  addBox(g, 1.1, 1.0, 0.12, 0x2b2f33, 0, 4.7, D / 2 - 0.28);
  addBox(g, 1.3, 0.12, 0.18, 0xf2f2ee, 0, 5.7, D / 2 - 0.26);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6.5, 12), mat(0xc9ccd0));
  silo.position.set(W / 2 + 0.2, 3.25, -D / 4);
  g.add(silo);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a929a));
  dome.position.set(W / 2 + 0.2, 6.5, -D / 4);
  g.add(dome);
  return g;
};

const garage: Builder = (_def, W, D) => {
  const g = new THREE.Group();
  addBox(g, W - 0.3, 0.2, D - 0.3, 0x8a8a85, 0, 0, 0);
  addBox(g, W - 0.5, 2.8, D - 0.5, 0xd8d6cc, 0, 0.2, 0);
  const roof = pitchedRoof(W - 0.5, D - 0.5, 1.5, 0x4f5a66, 0.4);
  roof.position.y = 3.0;
  g.add(roof);
  addBox(g, 3.6, 2.4, 0.12, 0xe8ebee, 0, 0.2, D / 2 - 0.2);
  for (let i = 0; i < 5; i++) addBox(g, 3.6, 0.05, 0.16, 0xaeb4ba, 0, 0.55 + i * 0.45, D / 2 - 0.16);
  windowAt(g, W / 2 - 0.25, 1.7, 0, 0.9, 0.8, 'right');
  return g;
};
const BUILDERS: Record<ModelKind, Builder> = {
  fence, wall, container, sandbags, gate, house, tent, bunker, well, tank, solar, turbine, generator, battery,
  greenhouse, garden, coop, orchard, hive, tower, floodlight, spikes, trench, crates, shed, warehouse, workbench,
  kitchen, mast, bunk, lamp, medical, fueltank, filter, rain, pole, pipe,
  pond, tree, hedge, flowers, path, firepit, bench, picnic, flagpole, boulder, scarecrow, windmill, barn, garage,
};

/** How far past its cells a model may reach before it is shrunk to fit, in meters. Trees and ponds may spill a little. */
const FIT_TOLERANCE: Partial<Record<ModelKind, number>> = { tree: 1.0, pond: 0.6, house: 0.5, barn: 0.5 };
/** Models whose pole or post must stay exactly in the middle of the cell, so they are never re-centred. */
const KEEP_CENTER = new Set<ModelKind>(['lamp', 'flagpole', 'floodlight', 'mast', 'tower', 'turbine', 'pole', 'pipe']);

/**
 * Make a model fit its cells. If it is wider or deeper than the footprint it is shrunk evenly until it fits, and if the
 * whole thing sits to one side it is moved to the middle, so nothing spills over the next tile.
 */
function fitToCells(group: THREE.Group, def: StructureDef, W: number, D: number): void {
  const tol = FIT_TOLERANCE[def.look.model] ?? 0.25;
  group.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(group);
  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  const s = Math.min(1, (W + tol) / sx, (D + tol) / sz);
  if (s < 0.999) {
    group.scale.setScalar(s);
    group.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(group);
  }
  if (!KEEP_CENTER.has(def.look.model)) {
    const cx = (box.max.x + box.min.x) / 2;
    const cz = (box.max.z + box.min.z) / 2;
    if (Math.abs(cx) > 0.3 || Math.abs(cz) > 0.3) {
      group.position.x -= Math.abs(cx) > 0.3 ? cx : 0;
      group.position.z -= Math.abs(cz) > 0.3 ? cz : 0;
    }
  }
}

/** Build the 3D model for a structure. The group is centered on the footprint (before rotation). */
export function makeStructure(def: StructureDef, links?: number): THREE.Group {
  const W = def.w * CELL;
  const D = def.d * CELL;
  // Fences, walls and hedges are drawn to match the neighbours they join; everything else ignores `links`
  // Fences, walls and sandbag walls stand on a grid line, drawn with the corner posts in `links` (both ends by default).
  // Hedges join their neighbours in `links`. Everything else ignores it.
  const edge = isEdgeStructure(def) && def.look.model !== 'gate';
  const line = isLineStructure(def);
  const group = edge ? buildEdge(def, links ?? (POST_START | POST_END)) : line ? buildLine(def, links ?? 0) : BUILDERS[def.look.model](def, W, D);
  if (!edge && !line) fitToCells(group, def, W, D);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return group;
}

export interface ModelBounds {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
}

/** The box around every structure model (for tests: nothing below ground, and everything inside its cells). */
export function structureBounds(defs: StructureDef[]): Record<string, ModelBounds> {
  const out: Record<string, ModelBounds> = {};
  for (const def of defs) {
    const model = makeStructure(def);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    out[def.id] = { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
  }
  return out;
}