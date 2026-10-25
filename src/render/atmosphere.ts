import * as THREE from 'three';

/**
 * Living scenery around the camera: drifting cloud shadows, birds crossing by day, fireflies among the trees at
 * night, and occasional rain. It is all decoration. Nothing here is saved or affects the rules.
 */

const RAIN_COUNT = 900;
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
  /** How hard it is raining right now, 0 to 1. */
  rain = 0;

  private readonly group = new THREE.Group();
  private readonly clouds: Cloud[] = [];
  private readonly cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTexture(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
  });
  private readonly birds: Bird[] = [];
  private readonly birdMat = new THREE.MeshBasicMaterial({ color: 0x232830, side: THREE.DoubleSide });
  private nextBird = 4;

  private readonly rainGeo = new THREE.BufferGeometry();
  private readonly rainPos = new Float32Array(RAIN_COUNT * 6);
  private readonly rainLines: THREE.LineSegments;
  private readonly rainMat = new THREE.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0, depthWrite: false });

  private readonly flyGeo = new THREE.BufferGeometry();
  private readonly flyPos = new Float32Array(FIREFLY_COUNT * 3);
  private readonly flyCol = new Float32Array(FIREFLY_COUNT * 3);
  private readonly flySeed = new Float32Array(FIREFLY_COUNT * 4);
  private readonly flies: THREE.Points;

  private time = 0;
  private rainTarget = 0;
  private rainTimer = 90 + Math.random() * 120; // seconds until the next shower
  private weatherOn = true;

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

    // Rain: each drop is a short slanted line that falls and wraps around inside a box
    for (let i = 0; i < RAIN_COUNT; i++) {
      const x = (Math.random() - 0.5) * 2 * AREA;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 2 * AREA;
      this.rainPos.set([x, y, z, x + 0.12, y - 1.6, z + 0.08], i * 6);
    }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.group.add(this.rainLines);

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

  /** Turn random showers on or off. Tests use this to control the weather. */
  setWeather(on: boolean): void {
    this.weatherOn = on;
    if (!on) this.rainTarget = 0;
  }

  /** Make it rain (or stop) right now. */
  forceRain(level: number): void {
    this.rainTarget = level;
    this.rainTimer = level > 0 ? 120 : 200;
  }

  update(dt: number, target: THREE.Vector3, daylight: number, forest: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.updateWeather(dt);
    this.updateClouds(dt, target, daylight);
    this.updateBirds(dt, target, daylight);
    this.updateRain(dt, target);
    this.updateFireflies(target, daylight, forest);
  }

  private updateWeather(dt: number): void {
    this.rainTimer -= dt;
    if (this.weatherOn && this.rainTimer <= 0) {
      if (this.rainTarget === 0) {
        this.rainTarget = 0.5 + Math.random() * 0.5;
        this.rainTimer = 60 + Math.random() * 100; // how long the shower lasts
      } else {
        this.rainTarget = 0;
        this.rainTimer = 180 + Math.random() * 300; // dry spell
      }
    }
    this.rain += (this.rainTarget - this.rain) * (1 - Math.exp(-dt / 5));
    if (this.rain < 0.005 && this.rainTarget === 0) this.rain = 0;
  }

  private updateClouds(dt: number, target: THREE.Vector3, daylight: number): void {
    this.cloudMat.opacity = 0.2 * daylight * (1 + this.rain * 0.9);
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

  private updateRain(dt: number, target: THREE.Vector3): void {
    const active = this.rain > 0.02;
    this.rainLines.visible = active;
    if (!active) return;
    this.rainMat.opacity = 0.6 * Math.min(1, this.rain * 1.4);
    this.rainGeo.setDrawRange(0, Math.floor(RAIN_COUNT * Math.min(1, 0.25 + this.rain)) * 2);
    const fall = 38 * dt;
    const p = this.rainPos;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const o = i * 6;
      p[o + 1] -= fall;
      p[o + 4] -= fall;
      if (p[o + 4] < 0) {
        // Back to the top at a fresh spot around the camera
        const x = target.x + (Math.random() - 0.5) * 2 * AREA;
        const z = target.z + (Math.random() - 0.5) * 2 * AREA;
        p[o] = x;
        p[o + 1] = 30 + Math.random() * 6;
        p[o + 2] = z;
        p[o + 3] = x + 0.12;
        p[o + 4] = p[o + 1] - 1.6;
        p[o + 5] = z + 0.08;
      }
    }
    this.rainGeo.attributes.position.needsUpdate = true;
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
