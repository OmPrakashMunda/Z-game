import * as THREE from 'three';

/**
 * Living scenery around the camera: drifting cloud shadows, birds crossing by day, fireflies among the trees at
 * night, and the weather the game's rules produce: smoothed rain, snow, wind, cloud and storm, with lightning. The rain and snow
 * themselves are painted over the screen by weatherfx.ts. Nothing here is saved.
 */

const FIREFLY_COUNT = 90;
const AREA = 60; // half-size in meters of the box that follows the camera

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // A cluster of soft blobs makes a lumpy cloud shape
    const blobs: Array<[number, number, number]> = [
      [0.5, 0.5, 0.34], [0.32, 0.55, 0.22], [0.68, 0.46, 0.24], [0.5, 0.3, 0.2], [0.55, 0.72, 0.2], [0.25, 0.4, 0.16],
    ];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }
  });
}

function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

interface Cloud {
  mesh: THREE.Mesh;
  speed: number;
}

interface Bird {
  group: THREE.Group;
  wings: THREE.Object3D[];
  vx: number;
  vz: number;
  age: number;
  flap: number;
}

export class Atmosphere {
  /** The weather as it looks right now. Each value eases toward what the game's weather says. */
  rain = 0;
  snow = 0;
  storm = 0;
  wind = 0.2;
  cloud = 0.3;
  /** The brightness of a lightning flash right now, 0 to 1. */
  flash = 0;
  /** How many strikes there have been, for tests. */
  strikes = 0;
  /** Called when lightning strikes the ground: where, in map meters. */
  onLightning: ((x: number, z: number) => void) | null = null;

  private readonly group = new THREE.Group();
  private readonly clouds: Cloud[] = [];
  private readonly cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTexture(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
  });
  private readonly birds: Bird[] = [];
  private readonly birdMat = new THREE.MeshBasicMaterial({ color: 0x232830, side: THREE.DoubleSide });
  private nextBird = 4;

  private readonly flyGeo = new THREE.BufferGeometry();
  private readonly flyPos = new Float32Array(FIREFLY_COUNT * 3);
  private readonly flyCol = new Float32Array(FIREFLY_COUNT * 3);
  private readonly flySeed = new Float32Array(FIREFLY_COUNT * 4);
  private readonly flies: THREE.Points;

  private time = 0;
  private goal = { rain: 0, snow: 0, storm: 0, wind: 0.2, cloud: 0.3 };
  private nextStrike = 12;
  private flashAge = 99;
  private readonly boltMat = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 1, depthWrite: false, depthTest: false });
  private readonly bolts: THREE.Line[] = [];
  private boltAge = 99;
  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    for (let i = 0; i < 7; i++) {
      const size = 45 + Math.random() * 45;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (0.55 + Math.random() * 0.3)), this.cloudMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.position.set((Math.random() - 0.5) * 2 * 150, 0.14, (Math.random() - 0.5) * 2 * 150);
      mesh.renderOrder = 1;
      this.group.add(mesh);
      this.clouds.push({ mesh, speed: 2 + Math.random() * 2.5 });
    }

    // Lightning bolts: three jagged lines side by side, so the flash has some thickness
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Line(new THREE.BufferGeometry(), this.boltMat);
      line.frustumCulled = false;
      line.visible = false;
      line.renderOrder = 50;
      this.group.add(line);
      this.bolts.push(line);
    }
    // Fireflies
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.flySeed.set([Math.random() * 100, Math.random() * 100, Math.random() * 6.28, 0.5 + Math.random()], i * 4);
      this.flyPos.set([(Math.random() - 0.5) * 2 * AREA, 0.6 + Math.random() * 2, (Math.random() - 0.5) * 2 * AREA], i * 3);
    }
    this.flyGeo.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3));
    this.flyGeo.setAttribute('color', new THREE.BufferAttribute(this.flyCol, 3));
    this.flies = new THREE.Points(
      this.flyGeo,
      new THREE.PointsMaterial({
        size: 12, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: false,
      }),
    );
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.group.add(this.flies);
  }

  /** Tell the atmosphere what the weather is. The picture eases toward it over a few seconds. */
  setWeather(w: { rain: number; snow: number; storm: number; wind: number; cloud: number }): void {
    this.goal = { ...w };
  }

  /** How dark and heavy the sky is, for dimming the light. */
  get gloom(): number {
    return Math.max(this.rain, this.snow * 0.8, this.cloud * 0.65, this.storm);
  }
  update(dt: number, target: THREE.Vector3, daylight: number, forest: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.updateWeather(dt);
    this.updateLightning(dt, target);
    this.updateClouds(dt, target, daylight);
    this.updateBirds(dt, target, daylight);
    this.updateFireflies(target, daylight, forest);
  }

  private updateWeather(dt: number): void {
    const ease = (now: number, goal: number, seconds: number) => {
      const next = now + (goal - now) * (1 - Math.exp(-dt / seconds));
      return Math.abs(next - goal) < 0.004 ? goal : next;
    };
    this.rain = ease(this.rain, this.goal.rain, 5);
    this.snow = ease(this.snow, this.goal.snow, 5);
    this.storm = ease(this.storm, this.goal.storm, 4);
    this.wind = ease(this.wind, this.goal.wind, 4);
    this.cloud = ease(this.cloud, this.goal.cloud, 10);
  }

  /** In a storm the sky flashes now and then. The strike lands somewhere near the camera. */
  private updateLightning(dt: number, target: THREE.Vector3): void {
    this.flashAge += dt;
    this.boltAge += dt;
    // Two quick pulses, then a slow fade
    const a = this.flashAge;
    this.flash = a < 0.07 ? 1 : a < 0.13 ? 0.25 : a < 0.2 ? 0.9 : a < 0.7 ? 0.9 * Math.exp(-(a - 0.2) * 6) : 0;
    if (this.flash < 0.01) this.flash = 0;
    const showBolt = this.boltAge < 0.28;
    this.boltMat.opacity = showBolt ? 1 - this.boltAge / 0.28 : 0;
    for (const b of this.bolts) b.visible = showBolt;
    if (this.storm < 0.3) {
      this.nextStrike = Math.max(this.nextStrike, 4);
      return;
    }
    this.nextStrike -= dt;
    if (this.nextStrike > 0) return;
    this.nextStrike = (26 - 20 * this.storm) * (0.6 + Math.random() * 0.9);
    // Mostly out in the distance, now and then close
    const close = Math.random() < 0.12;
    const r = close ? 4 + Math.random() * 14 : 25 + Math.random() * 75;
    const angle = Math.random() * Math.PI * 2;
    const x = target.x + Math.cos(angle) * r;
    const z = target.z + Math.sin(angle) * r;
    this.flashAge = 0;
    this.boltAge = 0;
    this.buildBolt(x, z);
    this.strikes++;
    this.onLightning?.(x, z);
  }

  private buildBolt(x: number, z: number): void {
    this.bolts.forEach((line, k) => {
      const pts: THREE.Vector3[] = [];
      const top = 90;
      let px = x + (Math.random() - 0.5) * 6;
      let pz = z + (Math.random() - 0.5) * 6;
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const y = top * (1 - i / steps);
        pts.push(new THREE.Vector3(px + k * 0.25, y, pz + k * 0.25));
        px += (Math.random() - 0.5) * (i < steps - 1 ? 9 : 0);
        pz += (Math.random() - 0.5) * (i < steps - 1 ? 9 : 0);
        if (i === steps - 1) {
          px = x;
          pz = z;
        }
      }
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    });
  }
  private updateClouds(dt: number, target: THREE.Vector3, daylight: number): void {
    this.cloudMat.opacity = Math.min(0.55, 0.2 * daylight * (0.6 + this.cloud * 1.8));
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      c.mesh.position.z += c.speed * 0.35 * dt;
      // Wrap around the camera so there are always clouds passing by
      if (c.mesh.position.x - target.x > 170) c.mesh.position.x -= 340;
      if (c.mesh.position.x - target.x < -170) c.mesh.position.x += 340;
      if (c.mesh.position.z - target.z > 170) c.mesh.position.z -= 340;
      if (c.mesh.position.z - target.z < -170) c.mesh.position.z += 340;
    }
  }

  private makeBird(): Bird {
    const group = new THREE.Group();
    const wings: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.18), new THREE.Vector3(s * 0.9, 0, -0.05), new THREE.Vector3(s * 0.15, 0, -0.35),
      ]);
      const wing = new THREE.Mesh(geo, this.birdMat);
      group.add(wing);
      wings.push(wing);
    }
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), this.birdMat));
    return { group, wings, vx: 0, vz: 0, age: 0, flap: Math.random() * 6 };
  }

  private updateBirds(dt: number, target: THREE.Vector3, daylight: number): void {
    this.nextBird -= dt;
    if (this.nextBird <= 0 && daylight > 0.55 && this.rain < 0.3) {
      this.nextBird = 7 + Math.random() * 14;
      // A small flock crossing the view from one side
      const heading = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 3;
      const flock = 2 + Math.floor(Math.random() * 4);
      const startX = target.x - Math.cos(heading) * 90 + (Math.random() - 0.5) * 40;
      const startZ = target.z - Math.sin(heading) * 90 + (Math.random() - 0.5) * 40;
      const altitude = 13 + Math.random() * 6;
      for (let i = 0; i < flock; i++) {
        const bird = this.makeBird();
        bird.vx = Math.cos(heading) * speed;
        bird.vz = Math.sin(heading) * speed;
        bird.group.position.set(startX - Math.cos(heading) * i * 2.2 + Math.sin(heading) * (i % 2 ? 1 : -1) * i * 1.2, altitude + (Math.random() - 0.5), startZ - Math.sin(heading) * i * 2.2 - Math.cos(heading) * (i % 2 ? 1 : -1) * i * 1.2);
        bird.group.rotation.y = -heading + Math.PI / 2;
        this.group.add(bird.group);
        this.birds.push(bird);
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.age += dt;
      b.flap += dt * 11;
      b.group.position.x += b.vx * dt;
      b.group.position.z += b.vz * dt;
      b.wings[0].rotation.z = Math.sin(b.flap) * 0.7;
      b.wings[1].rotation.z = -Math.sin(b.flap) * 0.7;
      if (b.age > 30 || Math.hypot(b.group.position.x - target.x, b.group.position.z - target.z) > 130) {
        this.group.remove(b.group);
        this.birds.splice(i, 1);
      }
    }
  }

  private updateFireflies(target: THREE.Vector3, daylight: number, forest: number): void {
    const night = 1 - daylight;
    const strength = night * night * Math.min(1, forest * 1.3) * (1 - Math.min(1, this.rain * 1.5));
    this.flies.visible = strength > 0.03;
    if (!this.flies.visible) return;
    const pos = this.flyPos;
    const col = this.flyCol;
    const t = this.time;
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const seed = i * 4;
      const sx = this.flySeed[seed];
      const sy = this.flySeed[seed + 1];
      const phase = this.flySeed[seed + 2];
      const rate = this.flySeed[seed + 3];
      const o = i * 3;
      // Drift lazily, and wrap inside the box that follows the camera
      pos[o] += Math.sin(t * 0.4 * rate + sx) * 0.012;
      pos[o + 2] += Math.cos(t * 0.35 * rate + sy) * 0.012;
      pos[o + 1] = 0.7 + Math.sin(t * 0.6 * rate + phase) * 0.5 + 0.8;
      if (pos[o] - target.x > AREA) pos[o] -= AREA * 2;
      if (pos[o] - target.x < -AREA) pos[o] += AREA * 2;
      if (pos[o + 2] - target.z > AREA) pos[o + 2] -= AREA * 2;
      if (pos[o + 2] - target.z < -AREA) pos[o + 2] += AREA * 2;
      // Blink
      const blink = Math.max(0, Math.sin(t * 1.3 * rate + phase * 3));
      const b = Math.pow(blink, 3) * strength;
      col[o] = 1.0 * b;
      col[o + 1] = 1.0 * b;
      col[o + 2] = 0.45 * b;
    }
    this.flyGeo.attributes.position.needsUpdate = true;
    this.flyGeo.attributes.color.needsUpdate = true;
  }

  get birdCount(): number {
    return this.birds.length;
  }

  get firefliesShown(): boolean {
    return this.flies.visible;
  }
}
