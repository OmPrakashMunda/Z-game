import * as THREE from 'three';

/**
 * Rain, snow and lightning flashes drawn over the whole picture. Because they are painted on the screen, not placed in the
 * world, they cover every corner however the view is turned, tilted or zoomed. Drops come in three layers, near ones big
 * and fast and far ones small and faint, and lean with the wind.
 */

const vertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uRain;
uniform float uSnow;
uniform float uWind;
uniform float uGloom;
uniform float uFlash;
uniform float uAspect;
uniform float uDay;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// One layer of falling streaks. cols is how many cells run across the screen.
float rainLayer(vec2 uv, float cols, float speed, float len, float width, float density, float seed) {
  vec2 p = vec2(uv.x * uAspect * cols, uv.y * cols * 0.28);
  p.x += p.y * (0.18 + uWind * 0.9);
  p.y += uTime * speed;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float h = hash(id + seed);
  if (h > density) return 0.0;
  float x0 = 0.15 + 0.7 * hash(id + seed + 17.0);
  float dx = abs(f.x - x0);
  float body = smoothstep(width, 0.0, dx);
  float tail = smoothstep(len, 0.0, f.y) * smoothstep(0.0, 0.04, f.y);
  return body * tail;
}

// One layer of drifting flakes.
float snowLayer(vec2 uv, float cols, float speed, float size, float density, float seed) {
  vec2 p = vec2(uv.x * uAspect * cols, uv.y * cols);
  p.y += uTime * speed;
  vec2 id = floor(p);
  float h = hash(id + seed);
  if (h > density) return 0.0;
  vec2 f = fract(p);
  float sway = sin(uTime * 1.3 + h * 40.0) * 0.18 + uWind * (0.4 + f.y * 0.5);
  vec2 c = vec2(0.5 + sway, 0.3 + 0.4 * hash(id + seed + 5.0));
  float d = length(f - c);
  return smoothstep(size, size * 0.35, d);
}

void main() {
  vec2 uv = vUv;
  float rainK = clamp(uRain * 1.6, 0.0, 1.0);
  float dens = 0.3 + 0.6 * rainK;

  float streak = 0.0;
  streak += rainLayer(uv, 62.0, 2.7, 0.6, 0.07, dens, 1.0) * 0.42;
  streak += rainLayer(uv, 40.0, 3.4, 0.65, 0.08, dens, 7.0) * 0.6;
  streak += rainLayer(uv, 24.0, 4.4, 0.75, 0.09, dens, 13.0) * 0.8;
  streak *= rainK * step(0.001, uRain);

  float flake = 0.0;
  float snowK = clamp(uSnow * 1.5, 0.0, 1.0);
  float sdens = 0.1 + 0.4 * snowK;
  flake += snowLayer(uv, 46.0, 0.55, 0.2, sdens, 3.0) * 0.5;
  flake += snowLayer(uv, 28.0, 0.8, 0.22, sdens, 9.0) * 0.7;
  flake += snowLayer(uv, 15.0, 1.1, 0.25, sdens, 21.0) * 0.9;
  flake *= snowK * step(0.001, uSnow);

  vec3 rainColor = mix(vec3(0.5, 0.58, 0.72), vec3(0.93, 0.96, 1.0), uDay);
  vec3 snowColor = mix(vec3(0.7, 0.75, 0.85), vec3(1.0), uDay);
  float aS = clamp(streak + flake, 0.0, 0.9);
  vec3 cS = (rainColor * streak + snowColor * flake) / max(streak + flake, 0.0001);

  // Overcast gloom: a cool, dark veil, strongest in storms
  float aG = uGloom * 0.22;
  vec3 cG = mix(vec3(0.03, 0.05, 0.09), vec3(0.16, 0.2, 0.27), uDay);

  // Lightning: a white-blue flash over everything
  float aF = clamp(uFlash, 0.0, 1.0) * 0.55;
  vec3 cF = vec3(0.86, 0.9, 1.0);

  float a1 = aS + aG * (1.0 - aS);
  vec3 c1 = (cS * aS + cG * aG * (1.0 - aS)) / max(a1, 0.0001);
  float a2 = aF + a1 * (1.0 - aF);
  vec3 c2 = (cF * aF + c1 * a1 * (1.0 - aF)) / max(a2, 0.0001);
  if (a2 < 0.003) discard;
  gl_FragColor = vec4(c2, a2);
}`;

export interface WeatherLook {
  rain: number;
  snow: number;
  wind: number;
  gloom: number;
  flash: number;
  /** Daylight, 0 to 1. */
  day: number;
}

export class WeatherFx {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uRain: { value: 0 }, uSnow: { value: 0 }, uWind: { value: 0 }, uGloom: { value: 0 },
        uFlash: { value: 0 }, uAspect: { value: 1.78 }, uDay: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(dt: number, look: WeatherLook, aspect: number): void {
    this.time += dt;
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uRain.value = look.rain;
    u.uSnow.value = look.snow;
    u.uWind.value = look.wind * 0.35;
    u.uGloom.value = look.gloom;
    u.uFlash.value = look.flash;
    u.uAspect.value = aspect;
    u.uDay.value = look.day;
    this.mesh.visible = look.rain > 0.01 || look.snow > 0.01 || look.gloom > 0.02 || look.flash > 0.01;
  }
}
