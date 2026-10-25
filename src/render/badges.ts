import * as THREE from 'three';
import type { IssueKind } from '../data/survival';
import { icon } from '../ui/icons';

/**
 * The round warning sign that floats above a structure with a problem. The symbol inside says what is wrong: a bolt for
 * power, a drop for water, a fuel pump for fuel, a sprout for seeds, an ear of wheat for animal feed.
 */

const GLYPH: Record<IssueKind, string> = { power: 'Zap', water: 'Droplet', fuel: 'Fuel', seeds: 'Sprout', feed: 'Wheat', repair: 'Wrench', clean: 'Droplets' };
const SIZE = 128;

const cache = new Map<IssueKind, THREE.CanvasTexture>();

function drawBase(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#d9453a';
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2 + 2, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Small amber triangle with an exclamation mark, top right
  ctx.fillStyle = '#f2b134';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(100, 4);
  ctx.lineTo(124, 46);
  ctx.lineTo(76, 46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a2a05';
  ctx.font = 'bold 26px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', 100, 42);
}

export function badgeTexture(kind: IssueKind): THREE.CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  drawBase(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);

  // The symbol is an SVG icon, which loads asynchronously. The texture updates when it arrives.
  const svg = icon(GLYPH[kind], 64);
  svg.setAttribute('stroke', '#ffffff');
  svg.setAttribute('stroke-width', '2.4');
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, SIZE / 2 - 30, SIZE / 2 - 28, 60, 60);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return tex;
}
