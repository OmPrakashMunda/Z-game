import * as THREE from 'three';
import { STRUCTURES } from '../data/structures';
import { makeStructure } from './structures';

/**
 * Small preview pictures of structures for the store, storage and build bar. Each one is the real 3D model drawn once
 * into an off-screen canvas, so the pictures always match what you will get.
 *
 * Drawing a picture takes a moment, so each one is saved in the browser (IndexedDB) the first time and simply loaded on every
 * later visit. A saved picture is only trusted while the structure's size and look are unchanged. Missing pictures are
 * drawn quietly in idle time, and the extra graphics context is released when nothing is left to draw.
 */

const WIDTH = 192;
const HEIGHT = 144;
/** Bump this when the way pictures are drawn changes, so older saved pictures are replaced. */
const DRAW_VERSION = 2;

const DB_NAME = 'zgame-assets';
const STORE = 'thumbs';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let failed = false;
let releaseTimer = 0;

const cache = new Map<string, string>();
const waiting = new Map<string, Array<(url: string | null) => void>>();
/** Pictures somebody is looking at, drawn first. */
const queue: string[] = [];
/** Pictures nobody has asked for yet, drawn when the browser is idle. */
const idleQueue: string[] = [];
let pumping = false;

// ---------------------------------------------------------------- Saved pictures

/** Changes whenever a structure would be drawn differently. */
function signature(id: string): string {
  const d = STRUCTURES[id];
  return `${DRAW_VERSION}|${d.w}x${d.d}|${JSON.stringify(d.look)}`;
}

let db: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (db) return db;
  db = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return db;
}

let loaded: Promise<void> | null = null;

/** Load every saved picture into memory. Safe to call many times. */
export function preloadThumbnails(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    const database = await openDb();
    if (!database) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = database.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const keys = store.getAllKeys();
        const values = store.getAll();
        tx.oncomplete = () => {
          const ids = keys.result as string[];
          ids.forEach((id, i) => {
            const entry = values.result[i] as { sig: string; url: string } | undefined;
            if (entry && STRUCTURES[id] && entry.sig === signature(id)) cache.set(id, entry.url);
          });
          resolve();
        };
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
  return loaded;
}

function remember(id: string, url: string): void {
  void openDb().then((database) => {
    if (!database) return;
    try {
      database.transaction(STORE, 'readwrite').objectStore(STORE).put({ sig: signature(id), url }, id);
    } catch {
      /* the picture is still in memory; saving it is only a speed-up */
    }
  });
}

// ---------------------------------------------------------------- Drawing

function setup(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(WIDTH, HEIGHT, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6a7a55, 1.25));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    return true;
  } catch (err) {
    console.warn('Could not create the thumbnail renderer', err);
    failed = true;
    renderer = null;
    return false;
  }
}

/** Give the graphics memory back a few seconds after the last picture was drawn. */
function scheduleRelease(): void {
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    if (queue.length || idleQueue.length || !renderer) return;
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
    scene = null;
    camera = null;
  }, 4000);
}

function draw(id: string): string | null {
  const def = STRUCTURES[id];
  if (!def || !setup() || !renderer || !scene || !camera) return null;

  const model = makeStructure(def);
  scene.add(model);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Frame the model tightly: wide things by their footprint, tall things by their height

  const elevation = THREE.MathUtils.degToRad(36);
  const offset = new THREE.Vector3(Math.cos(elevation) * Math.SQRT1_2, Math.sin(elevation), Math.cos(elevation) * Math.SQRT1_2).multiplyScalar(80);
  const half = Math.max(1.0, Math.max(size.x, size.z) * 0.58 + size.y * 0.3);
  camera.left = -half * (WIDTH / HEIGHT);
  camera.right = half * (WIDTH / HEIGHT);
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
  camera.position.copy(center).add(offset);
  camera.lookAt(center);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(model);
  // Free what the model used; a new one is built for the next picture
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  return url;
}

function finish(id: string, url: string | null): void {
  for (const cb of waiting.get(id) ?? []) cb(url);
  waiting.delete(id);
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const id = queue.shift() ?? idleQueue.shift();
    if (!id) {
      pumping = false;
      scheduleRelease();
      return;
    }
    let url = cache.get(id) ?? null;
    if (!url) {
      try {
        url = draw(id);
      } catch (err) {
        console.warn(`Could not draw a preview of ${id}`, err);
      }
      if (url) {
        cache.set(id, url);
        remember(id, url);
      }
    }
    finish(id, url);
    // One picture per turn keeps the interface responsive. Pictures nobody is waiting for go slower, in idle time.
    if (queue.length > 0) window.setTimeout(step, 0);
    else if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 500 });
    else window.setTimeout(step, 30);
  };
  window.setTimeout(step, 0);
}

/** Get a picture of a structure. The callback gets a data URL, or null if pictures are not available. */
export function requestThumbnail(id: string, callback: (url: string | null) => void): void {
  void preloadThumbnails().then(() => {
    const hit = cache.get(id);
    if (hit) {
      callback(hit);
      return;
    }
    const list = waiting.get(id);
    if (list) {
      list.push(callback);
      // Somebody is looking at it now, so move it up
      const idle = idleQueue.indexOf(id);
      if (idle >= 0) idleQueue.splice(idle, 1);
      if (!queue.includes(id)) queue.push(id);
      return;
    }
    waiting.set(id, [callback]);
    queue.push(id);
    pump();
  });
}

/** Draw every picture that is not saved yet, in idle time, so the store opens instantly. */
export function prewarmThumbnails(): void {
  void preloadThumbnails().then(() => {
    for (const id of Object.keys(STRUCTURES)) {
      if (!cache.has(id) && !idleQueue.includes(id) && !queue.includes(id) && !waiting.has(id)) idleQueue.push(id);
    }
    if (idleQueue.length > 0) pump();
  });
}

/** Test helper: how many pictures are ready, and how many were loaded from the browser's saved copies. */
export function thumbnailStats(): { ready: number; total: number } {
  return { ready: cache.size, total: Object.keys(STRUCTURES).length };
}