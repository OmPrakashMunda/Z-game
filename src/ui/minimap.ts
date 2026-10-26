import { city, footprint, WORLD_HALF, type Rect } from '../data/city';
import { areaAt, CHUNK, housesInChunk, inWorldChunk, ROAD_LINES } from '../world/gen';
import { el } from './dom';
import { icon } from './icons';

export interface MapPoint {
  x: number;
  z: number;
}

export interface MinimapData {
  x: number;
  z: number;
  /** The way the player faces, 0 toward +z. */
  heading: number;
  /** The land the player owns, if any. */
  land: Rect | null;
  waypoint: MapPoint | null;
  /** The houses searched so far, or null before the outbreak when no house can be searched. */
  looted: Record<string, unknown> | null;
}

const SMALL = 176;
const BIG = 360;
/** How far from the player the small map reaches, in meters. */
const LOCAL_REACH = 170;

const AREA_COLORS = { town: '#566348', suburb: '#516240', farmland: '#7a8248', woodland: '#33492f' } as const;

/**
 * A map in the corner. North is up. It shows the area around you; the button next to it opens the whole world, and
 * clicking either one sets a waypoint.
 */
export class Minimap {
  readonly root = el('div', 'minimap');
  private readonly canvas = el('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly toggle = el('button', 'minimap-btn');
  private big = false;
  private lastKey = '';
  private lastDraw = 0;
  private data: MinimapData | null = null;
  private terrain: { key: string; image: HTMLCanvasElement } | null = null;

  constructor(parent: HTMLElement, private readonly onPick: (p: MapPoint) => void) {
    this.ctx = this.canvas.getContext('2d')!;
    this.toggle.title = 'Show the whole world (click the map to set a waypoint)';
    this.toggle.append(icon('Expand', 14));
    this.toggle.addEventListener('click', () => {
      this.big = !this.big;
      this.root.classList.toggle('big', this.big);
      this.resize();
      this.lastKey = '';
      if (this.data) this.update(this.data, true);
    });
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.size;
      const py = ((e.clientY - r.top) / r.height) * this.size;
      const view = this.view();
      this.onPick({ x: view.cx + (px - this.size / 2) / view.scale, z: view.cz + (py - this.size / 2) / view.scale });
    });
    this.root.append(this.canvas, this.toggle);
    this.root.style.display = 'none';
    parent.append(this.root);
    this.resize();
  }

  private get size(): number {
    return this.big ? BIG : SMALL;
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.size * ratio);
    this.canvas.height = Math.round(this.size * ratio);
    this.canvas.style.width = `${this.size}px`;
    this.canvas.style.height = `${this.size}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'block' : 'none';
  }

  private view(): { cx: number; cz: number; scale: number } {
    const d = this.data;
    if (this.big || !d) return { cx: 0, cz: 0, scale: this.size / (WORLD_HALF * 2) };
    return { cx: d.x, cz: d.z, scale: this.size / (LOCAL_REACH * 2) };
  }

  /** Redraw if something moved. Drawing is limited to a few times a second. */
  update(d: MinimapData, force = false): void {
    this.data = d;
    const key = [this.big, Math.round(d.x / 1.5), Math.round(d.z / 1.5), Math.round(d.heading * 6), d.land?.x, d.land?.w, d.land?.d, d.waypoint?.x, d.waypoint?.z, d.looted ? Object.keys(d.looted).length : -1].join('|');
    const now = performance.now();
    if (!force && (key === this.lastKey || now - this.lastDraw < 120)) return;
    this.lastKey = key;
    this.lastDraw = now;
    this.draw(d);
  }

  /** Ground colour by kind of country, drawn once per view and reused while the player stays near. */
  private terrainImage(cx: number, cz: number, scale: number): HTMLCanvasElement {
    const cell = this.big ? 20 : 10;
    const key = `${this.big}|${Math.round(cx / cell)}|${Math.round(cz / cell)}`;
    if (this.terrain?.key === key) return this.terrain.image;
    const canvas = this.terrain?.image ?? document.createElement('canvas');
    canvas.width = this.size;
    canvas.height = this.size;
    const g = canvas.getContext('2d')!;
    const reach = this.size / scale / 2;
    for (let x = Math.floor((cx - reach) / cell) * cell; x < cx + reach; x += cell) {
      for (let z = Math.floor((cz - reach) / cell) * cell; z < cz + reach; z += cell) {
        g.fillStyle = Math.abs(x) > WORLD_HALF || Math.abs(z) > WORLD_HALF ? '#1d2418' : AREA_COLORS[areaAt(x + cell / 2, z + cell / 2)];
        g.fillRect((x - cx) * scale + this.size / 2, (z - cz) * scale + this.size / 2, cell * scale + 1, cell * scale + 1);
      }
    }
    this.terrain = { key, image: canvas };
    return canvas;
  }

  private draw(d: MinimapData): void {
    const g = this.ctx;
    const size = this.size;
    const { cx, cz, scale } = this.view();
    const px = (x: number) => (x - cx) * scale + size / 2;
    const pz = (z: number) => (z - cz) * scale + size / 2;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.terrainImage(cx, cz, scale), 0, 0, size, size);
    const reach = size / scale / 2;

    // Roads
    g.fillStyle = '#6a6e74';
    for (const l of ROAD_LINES) {
      const w = Math.max(1.5, l.width * scale);
      g.fillRect(px(l.pos) - w / 2, 0, w, size);
      g.fillRect(0, pz(l.pos) - w / 2, size, w);
    }
    for (const r of city.roads) g.fillRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), Math.max(1.5, r.w * scale), Math.max(1.5, r.d * scale));
    g.strokeStyle = '#9a8460';
    g.lineWidth = Math.max(1.2, 4 * scale);
    for (const road of city.dirtRoads) {
      g.beginPath();
      road.path.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))));
      g.stroke();
    }

    // Houses. After the outbreak the ones nobody has searched yet stand out.
    g.fillStyle = '#b3a58a';
    const c0x = Math.floor((cx - reach) / CHUNK);
    const c1x = Math.floor((cx + reach) / CHUNK);
    const c0z = Math.floor((cz - reach) / CHUNK);
    const c1z = Math.floor((cz + reach) / CHUNK);
    for (let a = c0x; a <= c1x; a++) {
      for (let b = c0z; b <= c1z; b++) {
        if (!inWorldChunk(a, b)) continue;
        for (const h of housesInChunk(a, b)) {
          const f = footprint(h);
          const w = Math.max(2, f.w * scale);
          const dd = Math.max(2, f.d * scale);
          if (d.looted) g.fillStyle = d.looted[h.id] ? '#5b574f' : '#f0cf62';
          g.fillRect(px(f.x) - w / 2, pz(f.z) - dd / 2, w, dd);
        }
      }
    }
    // Town buildings and plots
    for (const b of city.buildings) {
      if (b.kind === 'house') {
        g.fillStyle = '#b3a58a';
      } else {
        g.fillStyle = '#e0b04a';
      }
      const w = Math.max(2.5, b.w * scale);
      const dd = Math.max(2.5, b.d * scale);
      g.fillRect(px(b.x) - w / 2, pz(b.z) - dd / 2, w, dd);
    }
    for (const p of city.plots) {
      const r = p.bounds;
      const owned = d.land && Math.abs(d.land.x - r.x) < r.w && Math.abs(d.land.z - r.z) < r.d;
      const land = owned ? d.land! : r;
      g.strokeStyle = owned ? '#58e08a' : '#d9c26a';
      g.fillStyle = owned ? 'rgba(88,224,138,.25)' : 'rgba(217,194,106,.12)';
      g.lineWidth = 1.5;
      g.fillRect(px(land.x - land.w / 2), pz(land.z - land.d / 2), land.w * scale, land.d * scale);
      g.strokeRect(px(land.x - land.w / 2), pz(land.z - land.d / 2), land.w * scale, land.d * scale);
    }

    // Waypoint
    if (d.waypoint) {
      const x = Math.max(6, Math.min(size - 6, px(d.waypoint.x)));
      const z = Math.max(6, Math.min(size - 6, pz(d.waypoint.z)));
      g.fillStyle = '#ffc933';
      g.strokeStyle = '#1a1204';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, z - 6);
      g.lineTo(x + 5, z);
      g.lineTo(x, z + 6);
      g.lineTo(x - 5, z);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // The player: an arrow that points the way they face
    g.save();
    g.translate(px(d.x), pz(d.z));
    g.rotate(Math.PI - d.heading);
    g.fillStyle = '#ff7a3a';
    g.strokeStyle = '#1a0d04';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // Frame
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);
  }
}
