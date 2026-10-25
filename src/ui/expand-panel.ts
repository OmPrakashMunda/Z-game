import { city } from '../data/city';
import { balance } from '../data/balance';
import { expansionPrice, expansionProblem, ownedRect, plotOf, SIDES, LAND_STEP, type Side } from '../sim/land';
import type { GameState } from '../sim/state';
import { clearChildren, el, money } from './dom';
import { icon } from './icons';

/** The eight screen directions, counter-clockwise from the right. */
const SCREEN_DIRS: Array<{ label: string; icon: string }> = [
  { label: 'Right', icon: 'ArrowRight' },
  { label: 'Upper right', icon: 'ArrowUpRight' },
  { label: 'Top', icon: 'ArrowUp' },
  { label: 'Upper left', icon: 'ArrowUpLeft' },
  { label: 'Left', icon: 'ArrowLeft' },
  { label: 'Lower left', icon: 'ArrowDownLeft' },
  { label: 'Bottom', icon: 'ArrowDown' },
  { label: 'Lower right', icon: 'ArrowDownRight' },
];

/** Ground direction of each side of the land: north is toward -z. */
const SIDE_DIR: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** Where a side of the land sits on the screen, which depends on how far the view is turned. */
function sideOnScreen(side: Side, azimuth: number): { label: string; icon: string } {
  const [dx, dz] = SIDE_DIR[side];
  const right = dx * Math.sin(azimuth) - dz * Math.cos(azimuth);
  const up = -dx * Math.cos(azimuth) - dz * Math.sin(azimuth);
  const k = ((Math.round(Math.atan2(up, right) / (Math.PI / 4)) % 8) + 8) % 8;
  return SCREEN_DIRS[k];
}

/** A small panel for buying more land next to your plot. */
export class ExpandPanel {
  private readonly panel = el('div', 'expand-panel');
  private readonly body = el('div');
  private open = false;
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly getState: () => GameState,
    private readonly onExpand: (side: Side) => void,
    private readonly onPreview: (side: Side | null) => void,
    private readonly getAngle: () => number = () => Math.PI / 4,
  ) {
    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.addEventListener('click', () => this.hide());
    this.panel.append(close, el('h3', undefined, 'Buy more land'), this.body);
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.lastKey = '';
    this.panel.style.display = 'block';
    this.refresh();
  }

  hide(): void {
    this.open = false;
    this.panel.style.display = 'none';
    this.onPreview(null);
  }

  /** Redraw when the land, the money or the situation changes. */
  refresh(): void {
    if (!this.open) return;
    const state = this.getState();
    const plot = plotOf(state);
    const names = SIDES.map((s) => sideOnScreen(s, this.getAngle()).label);
    const key = JSON.stringify([state.plotId, state.expansion, Math.floor(state.money / 1000), state.phase, names]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    clearChildren(this.body);
    if (!plot) {
      this.body.append(el('p', 'empty', 'Buy a base plot first.'));
      return;
    }
    const land = ownedRect(plot, state.expansion);
    this.body.append(
      el('p', 'dim', `You own ${land.w} x ${land.d} m (${(land.w * land.d).toLocaleString('en-US')} m2). Each purchase adds a ${LAND_STEP} m strip along one edge.`),
    );
    for (const side of SIDES) {
      const problem = expansionProblem(state, side);
      const blockedForGood = problem !== null && !problem.startsWith('You need');
      const price = expansionPrice(plot, state.expansion, side);
      const row = el('div', `expand-row${blockedForGood ? ' blocked' : ''}`);
      row.addEventListener('mouseenter', () => this.onPreview(side));
      row.addEventListener('mouseleave', () => this.onPreview(null));
      const label = el('div', 'expand-label icon-label');
      const where = sideOnScreen(side, this.getAngle());
      label.append(icon(where.icon, 18), el('span', undefined, `${where.label} edge`));
      const info = el('div', 'dim', blockedForGood ? problem! : `${state.expansion[side]} of ${balance.landMaxSteps} bought`);
      const buy = el('button', 'btn good', problem && blockedForGood ? 'Unavailable' : money(price));
      buy.disabled = problem !== null;
      buy.title = problem ?? '';
      buy.addEventListener('click', () => this.onExpand(side));
      const left = el('div', 'grow');
      left.append(label, info);
      row.append(left, buy);
      this.body.append(row);
      if (problem && !blockedForGood) this.body.append(el('div', 'warn small', problem));
    }
    this.body.append(el('p', 'dim small', `Land costs about the same per square meter as your plot, and gets dearer on a side each time. Trees on new land are cleared for you. ${city.plots.length} plots exist; neighbours' land is never for sale.`));
  }
}
