import * as THREE from 'three';
import type { BuildingDef, DirtRoad, PlotDef, PropDef, Rect } from '../data/city';
import { mergeStatic } from './merge';

/**
 * Procedural low-poly model kit. Everything here returns a THREE.Group authored facing +z.
 * These can later be swapped for glTF assets without changing callers.
 */

const matCache = new Map<number, THREE.MeshStandardMaterial>();
export function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = color * 10 + Math.round(roughness * 10);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, flatShading: true });
    matCache.set(key, m);
  }
  return m;
}

/** Shared materials that react to time of day (set by the renderer). */
export const glassMat = new THREE.MeshStandardMaterial({
  color: 0x6f9bb0,
  roughness: 0.2,
  metalness: 0.4,
  emissive: 0xffd88a,
  emissiveIntensity: 0,
});
export const lampBulbMat = new THREE.MeshStandardMaterial({
  color: 0xfff2c4,
  emissive: 0xffe29a,
  emissiveIntensity: 0,
});

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `b${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g as THREE.BoxGeometry;
}
function cylGeo(rt: number, rb: number, h: number, seg = 8): THREE.CylinderGeometry {
  const key = `c${rt},${rb},${h},${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geoCache.set(key, g);
  }
  return g as THREE.CylinderGeometry;
}
function coneGeo(r: number, h: number, seg = 7): THREE.ConeGeometry {
  const key = `k${r},${h},${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.ConeGeometry(r, h, seg);
    geoCache.set(key, g);
  }
  return g as THREE.ConeGeometry;
}

function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** Add a box whose BASE sits at y. */
export function addBox(
  parent: THREE.Object3D, w: number, h: number, d: number,
  material: THREE.Material | number, x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function addCyl(
  parent: THREE.Object3D, rt: number, rb: number, h: number, color: number | THREE.Material,
  x: number, y: number, z: number, seg = 8,
): THREE.Mesh {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), typeof color === 'number' ? mat(color) : color);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function makeLabelTexture(text: string, bg: string, fg: string, w = 512, h = 96): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = fg;
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 48;
  while (ctx.measureText(text).width > w - 40 && size > 16) {
    size -= 2;
    ctx.font = `bold ${size}px Arial, sans-serif`;
  }
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cssColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function addSign(parent: THREE.Object3D, text: string, bg: number, fg: string, w: number, x: number, y: number, z: number): void {
  const h = w * 0.19;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: makeLabelTexture(text, cssColor(bg), fg), roughness: 0.6 }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

// ---------------------------------------------------------------- Buildings

export function makeBuilding(def: BuildingDef): THREE.Group {
  const g = new THREE.Group();
  const { w, d, h } = def;

  // Foundation + body
  addBox(g, w + 0.3, 0.35, d + 0.3, 0x77716a, 0, 0, 0);
  addBox(g, w, h, d, def.color, 0, 0.35, 0);

  if (def.kind === 'house') {
    makeHouseDetails(g, def);
  } else {
    makeShopDetails(g, def);
  }

  g.rotation.y = def.facing === 'S' ? 0 : Math.PI;
  g.position.set(def.x, 0, def.z);
  return mergeStatic(shadow(g)) as THREE.Group;
}

function makeShopDetails(g: THREE.Group, def: BuildingDef): void {
  const { w, d, h } = def;
  const front = d / 2;
  const top = h + 0.35;

  // Flat roof with parapet
  addBox(g, w + 0.5, 0.45, d + 0.5, def.roofColor, 0, top, 0);
  addBox(g, w + 0.5, 0.35, 0.3, def.accent, 0, top, front + 0.2);
  // Rooftop units
  addBox(g, 1.8, 0.9, 1.4, 0x9aa0a6, -w / 4, top + 0.45, -d / 5);
  addBox(g, 1.4, 0.7, 1.2, 0x8c9298, w / 5, top + 0.45, -d / 6);
  addCyl(g, 0.25, 0.25, 1.2, 0x666666, w / 3, top + 0.45, d / 6, 6);

  // Door
  const doorW = 1.8;
  addBox(g, doorW + 0.3, 2.7, 0.2, 0x3a3a3a, 0, 0.35, front + 0.02);
  addBox(g, doorW, 2.5, 0.12, glassMat, 0, 0.35, front + 0.12);

  // Storefront windows either side of the door
  const winW = Math.min(3.4, (w - doorW) / 2 - 1.2);
  if (winW > 0.8) {
    for (const s of [-1, 1]) {
      const wx = s * (doorW / 2 + 0.9 + winW / 2);
      addBox(g, winW + 0.3, 1.9, 0.18, 0x3a3a3a, wx, 0.95, front + 0.02);
      addBox(g, winW, 1.6, 0.12, glassMat, wx, 1.1, front + 0.12);
    }
  }

  // Awning
  addBox(g, w - 1, 0.18, 1.6, def.accent, 0, 3.15, front + 0.8);
  addBox(g, w - 1, 0.35, 0.1, 0xffffff, 0, 2.85, front + 1.55);

  // Name sign standing on the roof edge (visible from the tilted camera)
  const signW = Math.min(w - 2, 7);
  const signH = signW * 0.19;
  addBox(g, signW + 0.3, signH + 0.3, 0.2, 0x2b2b2b, 0, top + 0.3, front + 0.2);
  addSign(g, def.name, def.accent, '#ffffff', signW, 0, top + 0.3 + 0.15 + signH / 2, front + 0.32);

  // Side windows
  for (const s of [-1, 1]) {
    for (let i = -1; i <= 1; i += 2) {
      addBox(g, 0.1, 1.2, 1.6, glassMat, s * (w / 2 + 0.02), 1.6, i * (d / 4));
    }
  }
}

function makeHouseDetails(g: THREE.Group, def: BuildingDef): void {
  const { w, d, h } = def;
  const front = d / 2;
  const top = h + 0.35;

  // Pitched roof (triangular prism)
  const rh = 2.4;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - 0.4, 0);
  shape.lineTo(w / 2 + 0.4, 0);
  shape.lineTo(0, rh);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false });
  const roof = new THREE.Mesh(roofGeo, mat(def.roofColor, 0.95));
  roof.position.set(0, top, -(d + 0.8) / 2);
  g.add(roof);

  // Chimney
  addBox(g, 0.9, 2.4, 0.9, 0x8a5a4a, w / 4, top + 0.6, -d / 5);

  // Door + frame + step
  addBox(g, 1.5, 2.4, 0.18, 0x5b3a29, -w / 4, 0.35, front + 0.03);
  addBox(g, 2.0, 0.2, 1.1, 0x8a8580, -w / 4, 0, front + 0.55);
  addBox(g, 0.12, 0.12, 0.12, 0xd6b24a, -w / 4 + 0.5, 1.4, front + 0.15);

  // Windows with shutters
  for (const wx of [w / 5, w / 2 - 1.6]) {
    addBox(g, 1.7, 1.5, 0.14, 0xf0f0f0, wx, 1.3, front + 0.02);
    addBox(g, 1.4, 1.2, 0.12, glassMat, wx, 1.45, front + 0.1);
    addBox(g, 0.4, 1.3, 0.1, 0x3f6f5a, wx - 1.1, 1.35, front + 0.06);
    addBox(g, 0.4, 1.3, 0.1, 0x3f6f5a, wx + 1.1, 1.35, front + 0.06);
  }
  for (const s of [-1, 1]) {
    addBox(g, 0.1, 1.3, 1.5, glassMat, s * (w / 2 + 0.02), 1.5, 0);
  }
}

/** Gas station extras: canopy, pumps. Attached to the shop group's local +z side. */
export function makeGasCanopy(def: BuildingDef): THREE.Group {
  const g = new THREE.Group();
  const cw = 14;
  const cd = 8;
  const cz = def.d / 2 + 8;
  const roofY = 4.6;
  // Translucent so the pumps and the player stay visible from the tilted camera
  const slab = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.8, transparent: true, opacity: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.8, transparent: true, opacity: 0.55 });
  addBox(g, cw, 0.5, cd, slab, 0, roofY, cz);
  addBox(g, cw + 0.1, 0.3, cd + 0.1, trim, 0, roofY + 0.5, cz);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(g, 0.25, 0.25, roofY, 0xbfbfbf, sx * (cw / 2 - 0.8), 0, cz + sz * (cd / 2 - 0.8), 8);
    }
  }
  for (const px of [-3, 3]) {
    const pump = new THREE.Group();
    addBox(pump, 0.9, 1.7, 0.6, 0xd32f2f, 0, 0.1, 0);
    addBox(pump, 0.7, 0.5, 0.64, 0x1b1b1b, 0, 1.1, 0);
    addBox(pump, 1.3, 0.1, 1.0, 0x8a8a8a, 0, 0, 0);
    pump.position.set(px, 0, cz);
    g.add(pump);
  }
  g.rotation.y = def.facing === 'S' ? 0 : Math.PI;
  g.position.set(def.x, 0, def.z);
  return mergeStatic(shadow(g)) as THREE.Group;
}

// ---------------------------------------------------------------- Props

const CAR_COLORS = [0xb23a32, 0x3b5f9a, 0xd9d9d9, 0x2e3033, 0xc9a43a, 0x4c7c59];
const BARREL_COLORS = [0xb23a32, 0x2f6fb3, 0x4c7c59];

export function makeProp(p: PropDef): THREE.Group {
  const g = new THREE.Group();
  switch (p.kind) {
    case 'barrel': {
      const col = BARREL_COLORS[p.variant % BARREL_COLORS.length];
      addCyl(g, 0.36, 0.36, 1.0, col, 0, 0, 0, 10);
      addCyl(g, 0.38, 0.38, 0.08, 0x2b2b2b, 0, 0.25, 0, 10);
      addCyl(g, 0.38, 0.38, 0.08, 0x2b2b2b, 0, 0.7, 0, 10);
      break;
    }
    case 'crate': {
      addBox(g, 1, 1, 1, 0xa57a46, 0, 0, 0);
      addBox(g, 1.06, 0.12, 1.06, 0x7d5a32, 0, 0.06, 0);
      addBox(g, 1.06, 0.12, 1.06, 0x7d5a32, 0, 0.82, 0);
      for (const sx of [-0.44, 0.44]) addBox(g, 0.12, 1.02, 1.06, 0x7d5a32, sx, 0, 0);
      break;
    }
    case 'dumpster': {
      addBox(g, 2.2, 1.2, 1.2, 0x2f6a4a, 0, 0.15, 0);
      addBox(g, 2.3, 0.14, 1.3, 0x1f4a33, 0, 1.35, 0);
      for (const sx of [-0.9, 0.9]) addCyl(g, 0.12, 0.12, 0.15, 0x222222, sx, 0, 0.4, 6);
      break;
    }
    case 'lamp': {
      addCyl(g, 0.08, 0.12, 5.2, 0x4a4f55, 0, 0, 0, 6);
      addBox(g, 1.1, 0.12, 0.2, 0x4a4f55, 0.45, 5.1, 0);
      const bulb = new THREE.Mesh(boxGeo(0.4, 0.12, 0.3), lampBulbMat);
      bulb.position.set(0.85, 5.02, 0);
      g.add(bulb);
      break;
    }
    case 'cone': {
      addBox(g, 0.5, 0.06, 0.5, 0x222222, 0, 0, 0);
      const c = new THREE.Mesh(coneGeo(0.2, 0.7, 8), mat(0xf26a21));
      c.position.y = 0.4;
      c.castShadow = true;
      g.add(c);
      break;
    }
    case 'car': {
      const col = CAR_COLORS[p.variant % CAR_COLORS.length];
      addBox(g, 1.9, 0.7, 4.3, col, 0, 0.35, 0);
      addBox(g, 1.7, 0.65, 2.2, col, 0, 1.05, -0.2);
      // windows
      addBox(g, 1.72, 0.45, 1.9, 0x23313d, 0, 1.15, -0.2).scale.set(1.01, 1, 1.01);
      addBox(g, 1.95, 0.12, 4.35, 0x222222, 0, 0.3, 0);
      for (const sx of [-0.95, 0.95]) {
        for (const sz of [-1.4, 1.4]) {
          const wheel = new THREE.Mesh(cylGeo(0.38, 0.38, 0.3, 10), mat(0x1b1b1b));
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sx, 0.38, sz);
          wheel.castShadow = true;
          g.add(wheel);
        }
      }
      for (const sx of [-0.6, 0.6]) {
        addBox(g, 0.35, 0.18, 0.08, 0xfff4c2, sx, 0.55, 2.16);
        addBox(g, 0.35, 0.18, 0.08, 0xc62828, sx, 0.55, -2.16);
      }
      break;
    }
  }
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rot;
  return mergeStatic(shadow(g)) as THREE.Group;
}

// ---------------------------------------------------------------- Plots

export function makePlotMarker(plot: PlotDef, owned = false, bounds: Rect = plot.bounds): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = bounds;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      color: owned ? 0x6f8f55 : plot.ground, roughness: 1, transparent: true, opacity: owned ? 0.75 : 0.8,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.03;
  ground.receiveShadow = true;
  g.add(ground);

  // Corner stakes with orange tape
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addCyl(g, 0.06, 0.06, 1.4, 0xd9d2c0, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2), 5);
      addBox(g, 0.3, 0.2, 0.3, 0xf26a21, sx * (w / 2 - 0.2), 1.2, sz * (d / 2 - 0.2));
    }
  }

  // "For sale" board facing the road (north side of the plot faces -z, so face -z... plots are south of road)
  const board = new THREE.Group();
  addCyl(board, 0.06, 0.06, 1.8, 0x5b4a3a, -0.9, 0, 0, 5);
  addCyl(board, 0.06, 0.06, 1.8, 0x5b4a3a, 0.9, 0, 0, 5);
  addSign(board, plot.name.toUpperCase(), 0xf2f2f2, owned ? '#1b5e20' : '#b71c1c', 2.6, 0, 1.6, 0.05);
  addSign(board, owned ? 'YOUR BASE' : 'FOR SALE', owned ? 0x2e7d32 : 0xb71c1c, '#ffffff', 2.6, 0, 1.0, 0.05);
  board.position.set(0, 0, -d / 2 + 0.5); // faces +z so the tilted camera sees the front
  g.add(shadow(board));

  g.position.set(bounds.x, 0, bounds.z);
  return g;
}

// ---------------------------------------------------------------- Dirt road

function makeDirtTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  ctx.clearRect(0, 0, w, h);
  // Ragged edges: each row gets its own left/right edge so the track does not look like a ruler line
  for (let y = 0; y < h; y++) {
    const left = 4 + rnd() * 9;
    const right = w - 4 - rnd() * 9;
    ctx.fillStyle = y % 2 ? '#8a6b45' : '#826440';
    ctx.fillRect(left, y, right - left, 1);
  }
  // Worn wheel tracks and a grassy strip down the middle
  ctx.fillStyle = 'rgba(60,42,24,0.45)';
  ctx.fillRect(w * 0.24, 0, 11, h);
  ctx.fillRect(w * 0.66, 0, 11, h);
  ctx.fillStyle = 'rgba(96,120,60,0.28)';
  ctx.fillRect(w * 0.46, 0, 9, h);
  // Pebbles and dust
  for (let i = 0; i < 700; i++) {
    const light = rnd() > 0.5;
    ctx.fillStyle = light ? 'rgba(190,160,115,0.35)' : 'rgba(55,38,22,0.35)';
    const s = 1 + rnd() * 3;
    ctx.fillRect(10 + rnd() * (w - 20), rnd() * h, s, s);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** A flat ribbon that follows the road's path. */
export function makeDirtRoad(road: DirtRoad): THREE.Mesh {
  const pts = road.path;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let travelled = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    if (i > 0) travelled += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const half = road.width / 2;
    positions.push(pts[i].x + nx * half, 0.035, pts[i].z + nz * half);
    positions.push(pts[i].x - nx * half, 0.035, pts[i].z - nz * half);
    uvs.push(0, travelled / 10, 1, travelled / 10);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // counter-clockwise seen from above, so the faces point up
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: makeDirtTexture(), roughness: 1, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
// ---------------------------------------------------------------- Map markers

/** A floating pin (point down) that marks a place on the map. */
export function makePin(color: number): THREE.Group {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.35 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 4), material);
  tip.rotation.x = Math.PI; // point down
  tip.position.y = 1.3;
  tip.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), material);
  head.position.y = 3.3;
  head.castShadow = true;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  dot.position.set(0, 3.3, 0);
  g.add(tip, head, dot);
  return g;
}

// ---------------------------------------------------------------- Characters

export interface CharacterRig {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

export function makeCharacter(opts: { shirt: number; pants: number; skin: number; hair?: number; backpack?: boolean }): CharacterRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const makeLimb = (x: number, y: number, w: number, h: number, color: number): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(boxGeo(w, h, w), mat(color));
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    body.add(pivot);
    return pivot;
  };

  const legL = makeLimb(-0.16, 0.8, 0.22, 0.8, opts.pants);
  const legR = makeLimb(0.16, 0.8, 0.22, 0.8, opts.pants);
  addBox(body, 0.62, 0.75, 0.34, opts.shirt, 0, 0.8, 0);
  const armL = makeLimb(-0.42, 1.5, 0.17, 0.7, opts.shirt);
  const armR = makeLimb(0.42, 1.5, 0.17, 0.7, opts.shirt);
  addBox(body, 0.34, 0.34, 0.34, opts.skin, 0, 1.58, 0);
  if (opts.hair !== undefined) addBox(body, 0.37, 0.14, 0.37, opts.hair, 0, 1.83, -0.01);
  if (opts.backpack) addBox(body, 0.5, 0.6, 0.26, 0x7a5a2a, 0, 0.9, -0.3);

  return { group: shadow(group), legL, legR, armL, armR };
}

export function makePlayer(): CharacterRig {
  return makeCharacter({ shirt: 0x2f6fb3, pants: 0x3a3f4a, skin: 0xf0c9a0, hair: 0x4a3320, backpack: true });
}

export function animateCharacter(rig: CharacterRig, time: number, speed: number): void {
  const swing = Math.min(1, speed / 4) * 0.9;
  const t = time * (6 + speed);
  rig.legL.rotation.x = Math.sin(t) * swing;
  rig.legR.rotation.x = -Math.sin(t) * swing;
  rig.armL.rotation.x = -Math.sin(t) * swing * 0.8;
  rig.armR.rotation.x = Math.sin(t) * swing * 0.8;
}
