import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Join the parts of a finished model that never move relative to each other into very few meshes.
 *
 * Buildings and cars are made of many boxes, each painted a slightly different colour, so they cannot be joined by
 * material. Instead each part's colour is written into its vertices, and all the plain-coloured parts are joined into
 * one mesh that uses a single shared vertex-colour material. A shop of 12 meshes becomes 3 or 4. Parts with a special
 * material (window glow, lamp bulbs, translucent canopies, textured signs) are left alone so they keep working.
 *
 * Do not use this on anything with parts that animate on their own (a spinning rotor, a rising blueprint).
 */

const sharedMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** One material for every plain-coloured part. The colour comes from the vertices. */
function vertexColorMaterial(roughness: number, metalness: number, flat: boolean): THREE.MeshStandardMaterial {
  const key = `${roughness}|${metalness}|${flat ? 1 : 0}`;
  let m = sharedMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading: flat });
    sharedMaterials.set(key, m);
  }
  return m;
}

/** A material that is just a colour: no texture, no glow, no see-through, no custom shader. */
function isPlain(m: THREE.Material): m is THREE.MeshStandardMaterial {
  const s = m as THREE.MeshStandardMaterial;
  return (
    s.isMeshStandardMaterial === true &&
    !s.map && !s.emissiveMap && !s.normalMap && !s.alphaMap &&
    !s.transparent && s.opacity === 1 &&
    s.emissive.getHex() === 0 &&
    !s.vertexColors &&
    // Materials with a custom shader (edge mist, tree trunks) must keep their own material
    !s.customProgramCacheKey().includes('trunk') && !s.onBeforeCompile.toString().includes('uEdge') &&
    !s.clippingPlanes
  );
}

export function mergeStatic(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();

  type Bucket = { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; sources: THREE.Mesh[] };
  const buckets = new Map<string, Bucket>();
  const color = new THREE.Color();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
    if (!mesh.visible || mesh.userData.keep) return;
    const geo = mesh.geometry;
    if (!geo.getAttribute('position')) return;

    const plain = isPlain(mesh.material);
    const target = plain
      ? vertexColorMaterial((mesh.material as THREE.MeshStandardMaterial).roughness, (mesh.material as THREE.MeshStandardMaterial).metalness, (mesh.material as THREE.MeshStandardMaterial).flatShading)
      : mesh.material;
    const key = `${target.uuid}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}`;
    let b = buckets.get(key);
    if (!b) {
      b = { material: target, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], sources: [] };
      buckets.set(key, b);
    }

    // Put the part where it sits relative to the root, and make every part carry the same attributes
    const part = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    for (const name of Object.keys(part.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') part.deleteAttribute(name);
    const count = part.getAttribute('position').count;
    if (!part.getAttribute('normal')) part.computeVertexNormals();
    if (!part.getAttribute('uv')) part.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (plain) {
      color.copy((mesh.material as THREE.MeshStandardMaterial).color);
      const rgb = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        rgb[i * 3] = color.r;
        rgb[i * 3 + 1] = color.g;
        rgb[i * 3 + 2] = color.b;
      }
      part.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    }
    b.parts.push(part);
    b.sources.push(mesh);
  });

  for (const b of buckets.values()) {
    if (b.sources.length < 2) {
      b.parts.forEach((p) => p.dispose());
      continue;
    }
    const merged = mergeGeometries(b.parts, false);
    if (!merged && import.meta.env.DEV) {
      console.warn('mergeStatic: could not join parts', b.parts.map((p) => Object.keys(p.attributes).join('+') + (p.index ? ' indexed' : '')));
    }
    b.parts.forEach((p) => p.dispose());
    if (!merged) continue;
    for (const src of b.sources) src.parent?.remove(src);
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
  return root;
}

export function countMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}
