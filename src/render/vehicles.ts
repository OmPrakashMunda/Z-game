import * as THREE from 'three';
import { VEHICLES, type VehicleDef } from '../data/vehicles';
import type { OwnedVehicle } from '../sim/vehicles';
import { mergeStatic } from './merge';
import { addBox, addCyl, mat } from './models';
import { headlightMat, taillightMat } from './traffic';

/** Drawing of the vehicles the player owns: bodies, fitted parts, spinning wheels and the trailer. */

const glass = new THREE.MeshStandardMaterial({ color: 0x23313d, roughness: 0.2, metalness: 0.4 });
const wheelMat = mat(0x1b1b1b);
const steel = 0x3b3f44;

interface Rig {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  radius: number;
}

function wheel(parent: THREE.Object3D, x: number, z: number, r: number, wide = 0.3): THREE.Mesh {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wide, 12), wheelMat);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, r, z);
  w.castShadow = true;
  w.userData.keep = true;
  parent.add(w);
  return w;
}

function lights(g: THREE.Object3D, w: number, front: number, back: number, y: number): void {
  for (const sx of [-1, 1]) {
    addBox(g, 0.34, 0.16, 0.08, headlightMat, sx * w * 0.32, y, front);
    addBox(g, 0.34, 0.16, 0.08, taillightMat, sx * w * 0.32, y, back);
  }
}

/** A wheel spins about the x axis. The mesh is turned to lie on its side, so spin is applied to a parent pivot. */
function pivot(parent: THREE.Object3D, wheelMesh: THREE.Mesh): THREE.Object3D {
  const p = new THREE.Group();
  p.position.set(wheelMesh.position.x, wheelMesh.position.y, wheelMesh.position.z);
  wheelMesh.position.set(0, 0, 0);
  parent.remove(wheelMesh);
  p.add(wheelMesh);
  parent.add(p);
  return p;
}

function body(def: VehicleDef, color: number, g: THREE.Group): { roof: number; wheelZ: number[]; r: number } {
  const L = def.length;
  const W = def.width;
  switch (def.id) {
    case 'bicycle': {
      addBox(g, 0.06, 0.06, 1.1, color, 0, 0.55, 0);
      addBox(g, 0.05, 0.7, 0.05, color, 0, 0.35, 0.45);
      addBox(g, 0.5, 0.05, 0.05, steel, 0, 1.0, 0.5);
      addBox(g, 0.14, 0.06, 0.3, 0x222222, 0, 0.92, -0.35);
      return { roof: 1.1, wheelZ: [0.75, -0.75], r: 0.34 };
    }
    case 'scooter': {
      addBox(g, 0.42, 0.14, 1.25, color, 0, 0.3, -0.05);
      addBox(g, 0.4, 0.5, 0.5, color, 0, 0.4, -0.55);
      addBox(g, 0.34, 0.1, 0.7, 0x222222, 0, 0.9, -0.4);
      addBox(g, 0.08, 0.8, 0.08, steel, 0, 0.3, 0.55);
      addBox(g, 0.6, 0.06, 0.06, steel, 0, 1.1, 0.5);
      return { roof: 1.2, wheelZ: [0.72, -0.72], r: 0.25 };
    }
    case 'sedan':
      addBox(g, W, 0.7, L, color, 0, 0.35, 0);
      addBox(g, W - 0.2, 0.65, 2.2, color, 0, 1.05, -0.2);
      addBox(g, W - 0.16, 0.45, 1.9, glass, 0, 1.15, -0.2);
      addBox(g, W + 0.05, 0.12, L + 0.05, 0x222222, 0, 0.3, 0);
      lights(g, W, L / 2 + 0.02, -L / 2 - 0.02, 0.62);
      return { roof: 1.7, wheelZ: [L / 2 - 0.9, -L / 2 + 0.9], r: 0.38 };
    case 'pickup':
      addBox(g, W, 0.75, L, color, 0, 0.35, 0);
      addBox(g, W - 0.15, 0.75, 1.9, color, 0, 1.1, 0.9);
      addBox(g, W - 0.11, 0.5, 1.6, glass, 0, 1.17, 0.9);
      addBox(g, W - 0.05, 0.5, 0.08, color, 0, 1.1, -L / 2 + 0.05);
      for (const sx of [-1, 1]) addBox(g, 0.08, 0.5, 1.9, color, sx * (W / 2 - 0.02), 1.1, -0.9);
      addBox(g, W + 0.05, 0.12, L + 0.05, 0x222222, 0, 0.3, 0);
      lights(g, W, L / 2 + 0.02, -L / 2 - 0.02, 0.62);
      return { roof: 1.85, wheelZ: [L / 2 - 0.9, -L / 2 + 0.9], r: 0.42 };
    case 'van':
      addBox(g, W, 1.7, L, color, 0, 0.4, 0);
      addBox(g, W + 0.04, 0.6, 1.2, glass, 0, 1.25, L / 2 - 0.9);
      addBox(g, W + 0.04, 0.08, L - 1.6, 0xeeeeee, 0, 2.05, -0.7);
      addBox(g, W + 0.05, 0.12, L + 0.05, 0x222222, 0, 0.3, 0);
      lights(g, W, L / 2 + 0.02, -L / 2 - 0.02, 0.7);
      return { roof: 2.1, wheelZ: [L / 2 - 0.9, -L / 2 + 0.9], r: 0.4 };
    case 'suv':
      addBox(g, W, 0.9, L, color, 0, 0.4, 0);
      addBox(g, W - 0.1, 0.8, 3.3, color, 0, 1.3, -0.3);
      addBox(g, W - 0.06, 0.55, 3.0, glass, 0, 1.4, -0.3);
      addBox(g, W + 0.05, 0.12, L + 0.05, 0x222222, 0, 0.3, 0);
      lights(g, W, L / 2 + 0.02, -L / 2 - 0.02, 0.7);
      return { roof: 2.15, wheelZ: [L / 2 - 0.95, -L / 2 + 0.95], r: 0.45 };
    case 'truck':
      addBox(g, W - 0.1, 2.0, 2.0, color, 0, 0.7, L / 2 - 1.0);
      addBox(g, W - 0.06, 0.8, 0.12, glass, 0, 1.7, L / 2 - 0.02);
      addBox(g, W, 2.7, L - 2.3, 0xe9e9e4, 0, 0.9, -1.15);
      addBox(g, W - 0.2, 0.4, L, 0x222222, 0, 0.35, 0);
      lights(g, W, L / 2 + 0.02, -L / 2 - 0.02, 0.8);
      return { roof: 3.7, wheelZ: [L / 2 - 1.1, -L / 2 + 1.5, -L / 2 + 0.6], r: 0.55 };
  }
}

function makeRig(def: VehicleDef, color: number, parts: readonly string[]): Rig {
  const g = new THREE.Group();
  const { roof, wheelZ, r } = body(def, color, g);
  const W = def.width;
  const L = def.length;
  const two = def.id === 'bicycle' || def.id === 'scooter';

  // Fitted parts
  if (parts.includes('roof_rack')) {
    addBox(g, W - 0.3, 0.06, 2.2, steel, 0, roof, -0.3);
    for (const sx of [-1, 1]) addBox(g, 0.05, 0.14, 2.2, steel, sx * (W / 2 - 0.2), roof, -0.3);
  }
  if (parts.includes('bull_bar')) {
    addBox(g, W * 0.85, 0.12, 0.14, steel, 0, 0.85, L / 2 + 0.12);
    for (const sx of [-1, 1]) addBox(g, 0.1, 0.7, 0.12, steel, sx * W * 0.36, 0.3, L / 2 + 0.12);
  }
  if (parts.includes('tow_hitch')) {
    addBox(g, 0.18, 0.14, 0.4, steel, 0, 0.45, -L / 2 - 0.2);
    addCyl(g, 0.07, 0.07, 0.1, 0x999999, 0, 0.55, -L / 2 - 0.35, 6);
  }
  if (parts.includes('extra_tank')) {
    const tank = addCyl(g, 0.22, 0.22, W * 0.7, 0x707a80, 0, 0.5, -L / 2 + 0.55, 10);
    tank.rotation.z = Math.PI / 2;
  }

  const wheels: THREE.Object3D[] = [];
  const spinners: THREE.Mesh[] = [];
  const x = two ? 0 : W / 2 - 0.12;
  for (const z of wheelZ) {
    if (two) {
      spinners.push(wheel(g, 0, z, r, 0.1));
    } else {
      spinners.push(wheel(g, -x, z, r), wheel(g, x, z, r));
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  mergeStatic(g);
  // Wheels were left out of the merge so they can turn; give each a pivot at its axle
  for (const w of spinners) wheels.push(pivot(g, w));
  return { group: g, wheels, radius: r };
}

function makeTrailer(): Rig {
  const g = new THREE.Group();
  addBox(g, 1.9, 0.14, 2.9, 0x55595e, 0, 0.55, -0.3);
  for (const sx of [-1, 1]) addBox(g, 0.07, 0.5, 2.9, 0x8a8f94, sx * 0.93, 0.62, -0.3);
  addBox(g, 1.9, 0.5, 0.07, 0x8a8f94, 0, 0.62, -1.72);
  addBox(g, 1.9, 0.5, 0.07, 0x8a8f94, 0, 0.62, 1.12);
  addBox(g, 0.12, 0.12, 1.6, steel, 0, 0.5, 1.9);
  addBox(g, 0.16, 0.16, 0.16, 0x999999, 0, 0.5, 2.7);
  const spinners = [wheel(g, -1.05, -0.3, 0.4), wheel(g, 1.05, -0.3, 0.4)];
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  mergeStatic(g);
  return { group: g, wheels: spinners.map((w) => pivot(g, w)), radius: 0.4 };
}

interface View {
  rig: Rig;
  key: string;
  trailer: Rig | null;
  root: THREE.Group;
  /** Distance travelled, for the wheels. */
  roll: number;
  lastX: number;
  lastZ: number;
  trailerRoll: number;
  tx: number;
  tz: number;
}

/** How far from the player vehicles are drawn, in meters. Past the mist they would float in the air. */
const DRAW_DISTANCE = 240;

export class VehicleLayer {
  private readonly views = new Map<number, View>();
  private readonly root = new THREE.Group();

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** The things a click can hit. */
  get pickables(): THREE.Object3D[] {
    return [...this.views.values()].map((v) => v.root);
  }

  /** Create, move and remove the vehicle models to match the game. */
  sync(vehicles: readonly OwnedVehicle[], near: { x: number; z: number }): void {
    const seen = new Set<number>();
    for (const v of vehicles) {
      seen.add(v.id);
      const def = VEHICLES[v.type];
      let view = this.views.get(v.id);
      const key = `${v.type}|${v.color}|${v.parts.join(',')}`;
      if (!view || view.key !== key) {
        if (view) this.root.remove(view.root);
        const rig = makeRig(def, v.color, v.parts);
        const root = new THREE.Group();
        root.add(rig.group);
        root.userData.pick = { type: 'vehicle', id: v.id };
        this.root.add(root);
        view = { rig, key, trailer: null, root, roll: 0, lastX: v.x, lastZ: v.z, trailerRoll: 0, tx: 0, tz: 0 };
        this.views.set(v.id, view);
      }
      const visible = Math.hypot(v.x - near.x, v.z - near.z) < DRAW_DISTANCE;
      view.root.visible = visible;
      // Trailer
      if (v.trailer && !view.trailer) {
        view.trailer = makeTrailer();
        this.root.add(view.trailer.group);
      } else if (!v.trailer && view.trailer) {
        this.root.remove(view.trailer.group);
        view.trailer = null;
      }
      view.rig.group.position.set(v.x, 0, v.z);
      view.rig.group.rotation.y = v.heading;
      view.root.position.set(0, 0, 0);
      // Wheels turn with the distance covered
      const moved = (v.x - view.lastX) * Math.sin(v.heading) + (v.z - view.lastZ) * Math.cos(v.heading);
      view.lastX = v.x;
      view.lastZ = v.z;
      if (Math.abs(moved) < 20) view.roll += moved / view.rig.radius;
      for (const w of view.rig.wheels) w.rotation.x = view.roll;
      if (view.trailer && v.trailer) {
        view.trailer.group.visible = visible;
        view.trailer.group.position.set(v.trailer.x, 0, v.trailer.z);
        view.trailer.group.rotation.y = v.trailer.heading;
        const tm = (v.trailer.x - view.tx) * Math.sin(v.trailer.heading) + (v.trailer.z - view.tz) * Math.cos(v.trailer.heading);
        view.tx = v.trailer.x;
        view.tz = v.trailer.z;
        if (Math.abs(tm) < 20) view.trailerRoll += tm / view.trailer.radius;
        for (const w of view.trailer.wheels) w.rotation.x = view.trailerRoll;
      }
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.root.remove(view.root);
      if (view.trailer) this.root.remove(view.trailer.group);
      this.views.delete(id);
    }
  }
}
