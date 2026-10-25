import * as THREE from 'three';
import type { City } from '../data/city';
import { mergeStatic } from './merge';
import { addBox, addCyl, mat } from './models';

/**
 * Cars driving along the town's roads, with traffic lights. This is scenery: it is not saved and runs on real time,
 * so it never affects the game rules. Cars follow lanes, keep their distance and stop for red lights.
 */

/** Headlight and tail light materials. Their glow is raised at night. */
export const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xfff0b0, emissiveIntensity: 0 });
export const taillightMat = new THREE.MeshStandardMaterial({ color: 0x8a1c1c, emissive: 0xff2a1a, emissiveIntensity: 0.2 });
const carGlass = new THREE.MeshStandardMaterial({ color: 0x23313d, roughness: 0.2, metalness: 0.4 });

const LAMP = { green: 0x2ee66a, yellow: 0xffc933, red: 0xff3b30 } as const;
type Signal = keyof typeof LAMP;

type VehicleKind = 'sedan' | 'hatch' | 'van' | 'pickup';
const KIND_LENGTH: Record<VehicleKind, number> = { sedan: 4.4, hatch: 3.8, van: 4.8, pickup: 5.0 };
const COLORS = [0xb23a32, 0x3b5f9a, 0xd9d9d9, 0x2e3033, 0xc9a43a, 0x4c7c59, 0x8a4f9e, 0xe07a2f, 0x5b8fa8];

function wheel(g: THREE.Object3D, x: number, z: number): void {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), mat(0x1b1b1b));
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.38, z);
  w.castShadow = true;
  g.add(w);
}

function lights(g: THREE.Object3D, front: number, back: number, y: number, half: number): void {
  for (const sx of [-1, 1]) {
    addBox(g, 0.34, 0.16, 0.08, headlightMat, sx * half, y, front);
    addBox(g, 0.34, 0.16, 0.08, taillightMat, sx * half, y, back);
  }
}

/** A car facing +z, centered on its footprint. */
function makeVehicle(kind: VehicleKind, color: number): THREE.Group {
  const g = new THREE.Group();
  const L = KIND_LENGTH[kind];
  switch (kind) {
    case 'sedan':
      addBox(g, 1.9, 0.7, L, color, 0, 0.35, 0);
      addBox(g, 1.7, 0.65, 2.2, color, 0, 1.05, -0.2);
      addBox(g, 1.74, 0.45, 1.9, carGlass, 0, 1.15, -0.2);
      break;
    case 'hatch':
      addBox(g, 1.8, 0.7, L, color, 0, 0.35, 0);
      addBox(g, 1.65, 0.7, 2.4, color, 0, 1.05, -0.35);
      addBox(g, 1.69, 0.48, 2.1, carGlass, 0, 1.12, -0.35);
      break;
    case 'van':
      addBox(g, 2.0, 1.7, L, color, 0, 0.4, 0);
      addBox(g, 2.04, 0.6, 1.2, carGlass, 0, 1.25, L / 2 - 0.9);
      addBox(g, 2.04, 0.08, L - 1.6, 0xeeeeee, 0, 1.7, -0.7);
      break;
    case 'pickup':
      addBox(g, 1.95, 0.75, L, color, 0, 0.35, 0);
      addBox(g, 1.8, 0.75, 1.9, color, 0, 1.1, 0.9);
      addBox(g, 1.84, 0.5, 1.6, carGlass, 0, 1.17, 0.9);
      // open bed
      addBox(g, 1.9, 0.5, 0.08, color, 0, 1.1, -L / 2 + 0.05);
      for (const sx of [-1, 1]) addBox(g, 0.08, 0.5, 1.9, color, sx * 0.93, 1.1, -0.9);
      break;
  }
  addBox(g, 1.95, 0.12, L + 0.05, 0x222222, 0, 0.3, 0);
  for (const sx of [-0.95, 0.95]) for (const sz of [L / 2 - 0.9, -L / 2 + 0.9]) wheel(g, sx, sz);
  lights(g, L / 2 + 0.02, -L / 2 - 0.02, 0.62, 0.62);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return mergeStatic(g) as THREE.Group;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  // Bright near the car (top), fading out along its length and toward the sides
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,240,190,0.95)');
  grad.addColorStop(0.5, 'rgba(255,230,160,0.35)');
  grad.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.5, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const beamMat = new THREE.MeshBasicMaterial({
  map: makeGlowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
});
const beamGeo = new THREE.PlaneGeometry(3.2, 8);

interface Intersection {
  x: number;
  z: number;
  /** Half the width of the vertical road and half the depth of the horizontal road. */
  vHalf: number;
  hHalf: number;
  offset: number;
  h: Signal;
  v: Signal;
  hMat: THREE.MeshBasicMaterial;
  vMat: THREE.MeshBasicMaterial;
}

let nextCarId = 1;

interface Car {
  id: number;
  group: THREE.Group;
  kind: VehicleKind;
  length: number;
  /** Distance along the lane in the direction of travel. */
  p: number;
  speed: number;
  cruise: number;
}

interface Stop {
  /** Position of the stop line along the lane in the direction of travel. */
  p: number;
  light: Intersection;
  axis: 'h' | 'v';
}

interface Lane {
  axis: 'x' | 'z';
  /** The coordinate across the lane (z for lanes along x, x for lanes along z). */
  fixed: number;
  dir: 1 | -1;
  /** Lane runs from `start` to `end` along its axis. */
  length: number;
  target: number;
  cars: Car[];
  stops: Stop[];
  spawnCooldown: number;
}

const GREEN = 13;
const YELLOW = 2;
const ALL_RED = 1.5;
const CYCLE = 2 * (GREEN + YELLOW + ALL_RED);
const LANE_HALF_LENGTH = 90;

function signalsAt(t: number): { h: Signal; v: Signal } {
  const tt = ((t % CYCLE) + CYCLE) % CYCLE;
  const half = GREEN + YELLOW + ALL_RED;
  const inHalf = tt % half;
  const phase: Signal = inHalf < GREEN ? 'green' : inHalf < GREEN + YELLOW ? 'yellow' : 'red';
  return tt < half ? { h: phase, v: 'red' } : { h: 'red', v: phase };
}

/** How busy the roads are through the day, 0 to 1. */
function busyness(hour: number): number {
  const peak = (c: number, w: number) => Math.exp(-Math.pow((hour - c) / w, 2));
  return Math.min(1, 0.18 + 0.85 * peak(8, 1.8) + 0.9 * peak(17.5, 2) + 0.55 * peak(12.5, 3));
}

export class Traffic {
  private readonly group = new THREE.Group();
  private readonly lanes: Lane[] = [];
  private readonly intersections: Intersection[] = [];
  private clock = 0;
  private enabled = true;

  constructor(scene: THREE.Scene, city: City) {
    scene.add(this.group);
    const horizontal = city.roads.filter((r) => r.w > r.d);
    const vertical = city.roads.filter((r) => r.d > r.w);

    // One intersection wherever a vertical road crosses a horizontal one
    for (const v of vertical) {
      horizontal.forEach((h, i) => {
        const inter: Intersection = {
          x: v.x, z: h.z, vHalf: v.w / 2, hHalf: h.d / 2, offset: i * 9.5,
          h: 'green', v: 'red',
          hMat: new THREE.MeshBasicMaterial({ color: LAMP.green }),
          vMat: new THREE.MeshBasicMaterial({ color: LAMP.red }),
        };
        this.intersections.push(inter);
        this.addSignalPoles(inter);
      });
    }

    for (const h of horizontal) {
      const off = h.d >= 10 ? 1.5 : 1.1;
      for (const dir of [1, -1] as const) {
        const stops: Stop[] = this.intersections
          .filter((it) => it.z === h.z)
          .map((it) => ({ p: -(it.vHalf + 1.3) + it.x * dir, light: it, axis: 'h' as const }));
        this.lanes.push({
          axis: 'x', fixed: h.z + dir * off, dir, length: LANE_HALF_LENGTH * 2,
          target: h.d >= 10 ? 4 : 3, cars: [], stops, spawnCooldown: Math.random() * 3,
        });
      }
    }
    for (const v of vertical) {
      const off = v.w >= 10 ? 1.5 : 1.1;
      for (const dir of [1, -1] as const) {
        const stops: Stop[] = this.intersections
          .filter((it) => it.x === v.x)
          .map((it) => {
            // Stop line before the crossing road, on the side the car comes from
            const s = dir === 1 ? it.z - (it.hHalf + 1.3) : it.z + (it.hHalf + 1.3);
            return { p: s * dir, light: it, axis: 'v' as const };
          });
        this.lanes.push({
          axis: 'z', fixed: v.x - dir * off, dir, length: LANE_HALF_LENGTH * 2,
          target: 5, cars: [], stops, spawnCooldown: Math.random() * 3,
        });
      }
    }
    this.prime();
  }

  /** Put some cars on the road to begin with, so the town does not start empty. */
  private prime(): void {
    for (const lane of this.lanes) {
      const n = Math.max(1, lane.target - 1);
      for (let i = 0; i < n; i++) {
        const p = -LANE_HALF_LENGTH + 10 + ((i + Math.random() * 0.6) / n) * (LANE_HALF_LENGTH * 2 - 25);
        this.spawn(lane, p, true);
      }
    }
  }

  private addSignalPoles(it: Intersection): void {
    const reach = it.vHalf + 1.4;
    const depth = it.hHalf + 1.4;
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const pole = new THREE.Group();
      addCyl(pole, 0.07, 0.09, 4.2, 0x3d4349, 0, 0, 0, 6);
      for (const [mat2, rot] of [[it.hMat, 0], [it.vMat, Math.PI / 2]] as const) {
        const head = new THREE.Group();
        addBox(head, 0.34, 0.9, 0.3, 0x1f2428, 0, 0, 0);
        const lamp = addBox(head, 0.22, 0.22, 0.04, mat2, 0, 0.35, 0.17);
        lamp.castShadow = false;
        head.position.set(0, 3.0, 0);
        head.rotation.y = rot;
        pole.add(head);
      }
      pole.position.set(it.x + sx * reach, 0, it.z + sz * depth);
      this.group.add(pole);
    }
  }

  private spawn(lane: Lane, p: number, instant = false): void {
    const kinds: VehicleKind[] = ['sedan', 'sedan', 'hatch', 'hatch', 'van', 'pickup'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const length = KIND_LENGTH[kind];
    // Keep clear of cars already there
    for (const c of lane.cars) if (Math.abs(c.p - p) < (c.length + length) / 2 + 5) return;
    const group = makeVehicle(kind, COLORS[Math.floor(Math.random() * COLORS.length)]);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = -Math.PI / 2; // lies flat; the bright end of the texture is nearest the car
    beam.position.set(0, 0.12, length / 2 + 4.2);
    group.add(beam);
    this.group.add(group);
    const cruise = 6 + Math.random() * 3.5;
    lane.cars.push({ id: nextCarId++, group, kind, length, p, speed: instant ? cruise * 0.8 : cruise, cruise });
    this.place(lane, lane.cars[lane.cars.length - 1]);
  }

  private place(lane: Lane, car: Car): void {
    const s = car.p * lane.dir;
    if (lane.axis === 'x') {
      car.group.position.set(s, 0, lane.fixed);
      car.group.rotation.y = lane.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.group.position.set(lane.fixed, 0, s);
      car.group.rotation.y = lane.dir === 1 ? 0 : Math.PI;
    }
  }

  /** Turn the traffic on or off. Cars already driving finish their trip, no new ones start. */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Number of cars within `radius` meters of a map point. */
  countNear(x: number, z: number, radius: number): number {
    let n = 0;
    for (const lane of this.lanes) {
      for (const c of lane.cars) {
        const p = c.group.position;
        if (Math.hypot(p.x - x, p.z - z) <= radius) n++;
      }
    }
    return n;
  }

  /** Every car's id, position and speed (for tests). */
  get snapshot(): Array<{ id: number; x: number; z: number; speed: number }> {
    return this.lanes.flatMap((l) => l.cars.map((c) => ({ id: c.id, x: c.group.position.x, z: c.group.position.z, speed: c.speed })));
  }

  get carCount(): number {
    return this.lanes.reduce((n, l) => n + l.cars.length, 0);
  }

  /** Cars currently waiting at a red light (for tests and sound). */
  get stoppedCount(): number {
    return this.lanes.reduce((n, l) => n + l.cars.filter((c) => c.speed < 0.2).length, 0);
  }

  /** Smallest gap in meters between any two cars in the same lane (for tests). */
  get minGap(): number {
    let best = Infinity;
    for (const lane of this.lanes) {
      const sorted = [...lane.cars].sort((a, b) => a.p - b.p);
      for (let i = 1; i < sorted.length; i++) {
        best = Math.min(best, sorted[i].p - sorted[i - 1].p - (sorted[i].length + sorted[i - 1].length) / 2);
      }
    }
    return best;
  }

  update(dt: number, hour: number, night: number): void {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    headlightMat.emissiveIntensity = night * 2.4;
    taillightMat.emissiveIntensity = 0.2 + night * 1.2;
    beamMat.opacity = night * 0.55;

    for (const it of this.intersections) {
      const s = signalsAt(this.clock + it.offset);
      it.h = s.h;
      it.v = s.v;
      it.hMat.color.setHex(LAMP[s.h]);
      it.vMat.color.setHex(LAMP[s.v]);
    }

    const activity = this.enabled ? busyness(hour) : 0;
    for (const lane of this.lanes) {
      lane.cars.sort((a, b) => b.p - a.p); // front car first
      const wanted = Math.round(lane.target * activity);

      for (let i = 0; i < lane.cars.length; i++) {
        const car = lane.cars[i];
        let limit = car.cruise;
        const brake = (gap: number) => Math.sqrt(2 * 6 * Math.max(0, gap - 0.9));

        if (i > 0) {
          const lead = lane.cars[i - 1];
          limit = Math.min(limit, brake(lead.p - car.p - (lead.length + car.length) / 2));
        }
        for (const stop of lane.stops) {
          const frontGap = stop.p - (car.p + car.length / 2);
          if (frontGap < -0.6) continue; // already past this line
          const sig = stop.axis === 'h' ? stop.light.h : stop.light.v;
          if (sig === 'green') continue;
          if (sig === 'yellow' && frontGap < 3) continue; // too close to stop safely
          limit = Math.min(limit, brake(frontGap));
        }

        const accel = limit > car.speed ? 3.2 : 9;
        car.speed += Math.max(-accel * dt, Math.min(accel * dt, limit - car.speed));
        car.speed = Math.max(0, car.speed);
        car.p += car.speed * dt;
        this.place(lane, car);
      }

      // Cars that reach the end of the road drive off the map
      while (lane.cars.length && lane.cars[0].p > lane.length / 2 - 1) {
        const gone = lane.cars.shift()!;
        this.group.remove(gone.group);
      }

      lane.spawnCooldown -= dt;
      if (lane.cars.length < wanted && lane.spawnCooldown <= 0) {
        lane.spawnCooldown = 2.5 + Math.random() * 4;
        this.spawn(lane, -lane.length / 2 + 2);
      }
    }
  }
}
