import * as THREE from 'three';

/**
 * The edge of the map fades into the sky colour, so the world ends in mist instead of a hard line of trees.
 * It is done in the material shader (a few instructions per pixel), so it costs nothing extra to draw.
 *
 * All patched materials share these uniforms. The sky colour is updated every frame by the renderer.
 */
export const edgeFade = {
  /** The sky colour as it appears on screen (already in display colour space). */
  color: { value: new THREE.Color(0x9fc9ee) },
  /** Where the world is fully hidden: minX, maxX, minZ, maxZ in meters. */
  rect: { value: new THREE.Vector4(-175, 265, -155, 155) },
  /** Meters inside that border over which the fade builds up. */
  width: { value: 60 },
};

export function setEdgeRect(minX: number, maxX: number, minZ: number, maxZ: number): void {
  edgeFade.rect.value.set(minX, maxX, minZ, maxZ);
}

const tmp = { r: 0, g: 0, b: 0 };

/** Set the fade colour from a scene background colour. */
export function setEdgeColor(sky: THREE.Color): void {
  sky.getRGB(tmp, THREE.SRGBColorSpace);
  edgeFade.color.value.setRGB(tmp.r, tmp.g, tmp.b, THREE.LinearSRGBColorSpace);
}

/** Make a standard material fade out toward the map edge. Works for normal and instanced meshes. */
export function applyEdgeFade<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeColor = edgeFade.color;
    shader.uniforms.uEdgeRect = edgeFade.rect;
    shader.uniforms.uEdgeWidth = edgeFade.width;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEdgePos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 edgeP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          edgeP = instanceMatrix * edgeP;
        #endif
        vEdgePos = (modelMatrix * edgeP).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEdgePos;\nuniform vec3 uEdgeColor;\nuniform vec4 uEdgeRect;\nuniform float uEdgeWidth;')
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        {
          float inside = min(min(vEdgePos.x - uEdgeRect.x, uEdgeRect.y - vEdgePos.x), min(vEdgePos.z - uEdgeRect.z, uEdgeRect.w - vEdgePos.z));
          float mist = 1.0 - smoothstep(0.0, uEdgeWidth, inside);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdgeColor, mist * mist * (3.0 - 2.0 * mist));
        }`,
      );
  };
  return material;
}

/**
 * For trees drawn as one shape: parts flagged as trunk (the `aTrunk` attribute) stay brown, while the rest takes the
 * per-tree colour. The trunk's brightness follows the tree's shade, so darker woods have darker trunks too.
 */
export function applyTrunkTint<M extends THREE.Material>(material: M, trunk = new THREE.Color(0x6b4a2b)): M {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uTrunk = { value: trunk };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTrunk;\nvarying float vTrunk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrunk = aTrunk;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTrunk;\nuniform vec3 uTrunk;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uTrunk * (0.55 + 0.9 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), vTrunk);`,
      );
  };
  material.customProgramCacheKey = () => 'tree-trunk';
  return material;
}