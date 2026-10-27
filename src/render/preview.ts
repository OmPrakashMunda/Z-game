import * as THREE from 'three';
import type { Gender, Look } from '../data/looks';
import { makePlayer, type CharacterRig } from './models';

/**
 * A small turntable that shows the survivor on the character screens. It has its own little renderer and scene, so it works
 * on the title screen without touching the game world. Drag it to turn the character.
 */
export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private rig: CharacterRig | null = null;
  private angle = 0.55;
  private frame = 0;
  private last = 0;
  private dragX: number | null = null;
  private disposed = false;

  constructor(width = 300, height = 380) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.camera = new THREE.PerspectiveCamera(27, width / height, 0.1, 50);
    this.camera.position.set(0, 1.25, 6.4);
    this.camera.lookAt(0, 1.0, 0);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3a2a, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.set(2.5, 4, 3.5);
    this.scene.add(sun);

    // A round plate under the feet with an amber rim
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0x2b3022, roughness: 0.9 }));
    plate.position.y = -0.04;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 8, 40), new THREE.MeshStandardMaterial({ color: 0xf0a52b, emissive: 0x6b4308, roughness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    this.scene.add(plate, rim);

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height, false);
      this.renderer.setClearColor(0x000000, 0);
    } catch (err) {
      console.warn('The character preview needs WebGL', err);
      this.renderer = null;
    }

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragX === null) return;
      this.angle += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
    });
    const endDrag = () => {
      this.dragX = null;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    this.last = performance.now();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** Show a survivor. */
  set(gender: Gender, look: Look): void {
    if (this.rig) this.scene.remove(this.rig.group);
    this.rig = makePlayer(gender, look);
    this.rig.group.rotation.y = this.angle;
    this.scene.add(this.rig.group);
  }

  private tick(now: number): void {
    if (this.disposed) return;
    this.frame = requestAnimationFrame((t) => this.tick(t));
    // Stop drawing once the screen has been closed
    if (!this.canvas.isConnected) return this.dispose();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.dragX === null) this.angle += dt * 0.6;
    if (this.rig) this.rig.group.rotation.y = this.angle;
    this.renderer?.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.renderer?.dispose();
    this.renderer = null;
  }
}
