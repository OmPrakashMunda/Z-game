import { itemById } from '../data/items';
import type { GameState } from '../sim/state';
import { button, el } from './dom';
import { icon } from './icons';
import { productImage } from './thumb';

export interface PlacingBarActions {
  onRotate(): void;
  onDone(): void;
  /** Open the storage list to pick something else. */
  onStorage(): void;
}

/**
 * A small bar that appears while you are putting a structure down. There is no separate building mode: you pick
 * a structure in your storage (or lift one off the ground to move it), and this bar only says what you hold.
 */
export class PlacingBar {
  private readonly bar = el('div', 'placing-bar');
  private readonly picture = el('div', 'placing-picture');
  private readonly name = el('div', 'placing-name');
  private readonly status = el('div', 'placing-status');
  private readonly rotateLabel = el('span');
  private lastKey = '';

  constructor(parent: HTMLElement, actions: PlacingBarActions) {
    const rotate = el('button', 'tool-btn');
    rotate.append(icon('RotateCw', 16), this.rotateLabel);
    rotate.addEventListener('click', () => actions.onRotate());
    this.rotateLabel.textContent = 'Rotate (R)';
    const text = el('div', 'placing-text');
    text.append(this.name, this.status);
    const storage = el('button', 'tool-btn');
    storage.append(icon('Package', 16), el('span', undefined, 'Storage (I)'));
    storage.addEventListener('click', () => actions.onStorage());
    this.bar.append(this.picture, text, rotate, storage, button({ label: 'Done (Esc)', kind: 'secondary', onClick: () => actions.onDone() }));
    this.bar.style.display = 'none';
    parent.append(this.bar);
  }

  show(): void {
    this.bar.style.display = 'flex';
    this.lastKey = '';
  }

  hide(): void {
    this.bar.style.display = 'none';
  }

  get isVisible(): boolean {
    return this.bar.style.display !== 'none';
  }

  setStatus(text: string, bad = false): void {
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.classList.toggle('bad', bad);
  }

  /** Redraw when what you hold, how many are left or the turn changed. */
  update(state: GameState, type: string | null, rot: number, moving: boolean): void {
    const have = type ? state.storage[type] ?? 0 : 0;
    const key = `${type}|${have}|${rot}|${moving}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.rotateLabel.textContent = `Rotate (R) ${rot * 90}\u00b0`;
    this.picture.replaceChildren();
    if (!type) {
      this.name.textContent = 'Nothing to place';
      return;
    }
    const item = itemById(type);
    this.picture.append(productImage(item, 44));
    this.name.textContent = moving ? `Moving: ${item.name}` : `${item.name}  x${have}`;
  }
}
