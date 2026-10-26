import * as THREE from 'three';

/**
 * How the seasons look. Leaves, grass and the sky are tinted by a few shared numbers that change very slowly with the date,
 * so the whole world turns from green to gold to bare and white without any object being rebuilt. The tint is done in the
 * material shaders, the same way the mist at the edge of the world is.
 */

type V3 = [number, number, number];
type V4 = [number, number, number, number];

/** Spring, summer, autumn, winter. The tint colour and how strongly it replaces the leaf colour. */
const OAK: V4[] = [[0.55, 0.85, 0.3, 0.3], [0, 0, 0, 0], [0.85, 0.42, 0.1, 0.72], [0.4, 0.34, 0.27, 0.85]];
const PINE: V4[] = [[0.5, 0.85, 0.4, 0.12], [0, 0, 0, 0], [0.3, 0.4, 0.2, 0.1], [0.88, 0.93, 1.0, 0.45]];
const BUSH: V4[] = [[0.6, 0.9, 0.3, 0.25], [0, 0, 0, 0], [0.8, 0.45, 0.15, 0.55], [0.9, 0.94, 1.0, 0.6]];
const GROUND: V3[] = [[1.0, 1.08, 0.92], [1, 1, 1], [1.12, 0.98, 0.72], [0.95, 0.97, 1.0]];
const SKY: V3[] = [[1, 1, 1.02], [1, 1, 0.98], [1.05, 0.96, 0.9], [0.92, 0.96, 1.02]];

/** The shared numbers the shaders read. */
export const seasonUniforms = {
  oak: { value: new THREE.Vector4() },
  pine: { value: new THREE.Vector4() },
  bush: { value: new THREE.Vector4() },
  ground: { value: new THREE.Color(1, 1, 1) },
  snow: { value: 0 },
  wet: { value: 0 },
};

/** The sky colour is multiplied by this. */
export const skyTint = new THREE.Color(1, 1, 1);

function blend<T extends number[]>(table: T[], phase: number): T {
  const p = phase * 4 - 0.5;
  const i = Math.floor(p);
  const f = p - i;
  const s = (1 - Math.cos(f * Math.PI)) / 2;
  const a = table[((i % 4) + 4) % 4];
  const b = table[(((i + 1) % 4) + 4) % 4];
  return a.map((v, k) => v + (b[k] - v) * s) as T;
}

/** Update the look for a day of the year (0 to 1), how much snow lies on the ground, and how wet the ground is. */
export function setSeason(yearPhase: number, snowCover: number, wetness: number): void {
  const oak = blend(OAK, yearPhase);
  const pine = blend(PINE, yearPhase);
  const bush = blend(BUSH, yearPhase);
  seasonUniforms.oak.value.set(...oak);
  seasonUniforms.pine.value.set(...pine);
  seasonUniforms.bush.value.set(...bush);
  const g = blend(GROUND, yearPhase);
  seasonUniforms.ground.value.setRGB(g[0], g[1], g[2]);
  seasonUniforms.snow.value = snowCover;
  seasonUniforms.wet.value = wetness;
  const s = blend(SKY, yearPhase);
  skyTint.setRGB(s[0], s[1], s[2]);
}

/** Tint the leaves of a tree, bush or oak. `trunk` is true for shapes that carry the `aTrunk` flag, so the bark keeps its colour. */
export function applySeasonFoliage<M extends THREE.Material>(material: M, kind: 'oak' | 'pine' | 'bush', trunk: boolean): M {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uLeaf = seasonUniforms[kind];
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uLeaf;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float leafLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float leafShare = ${trunk ? '1.0 - vTrunk' : '1.0'};
          diffuseColor.rgb = mix(diffuseColor.rgb, uLeaf.rgb * (0.45 + leafLum * 1.1), uLeaf.a * leafShare);
        }`,
      );
  };
  material.customProgramCacheKey = () => `season-${kind}-${trunk ? 'trunk' : 'plain'}`;
  return material;
}

/** Tint the ground with the season, lay snow on it and darken it when it is wet. */
export function applySeasonGround<M extends THREE.Material>(material: M): M {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uGroundTint = seasonUniforms.ground;
    shader.uniforms.uSnow = seasonUniforms.snow;
    shader.uniforms.uWet = seasonUniforms.wet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGroundTint;\nuniform float uSnow;\nuniform float uWet;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= uGroundTint * (1.0 - 0.32 * uWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98) * (1.0 - 0.1 * uWet), uSnow);`,
      );
  };
  material.customProgramCacheKey = () => `season-ground-${material.type}`;
  return material;
}
