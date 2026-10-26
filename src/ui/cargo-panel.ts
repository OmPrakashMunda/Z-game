import { itemById } from '../data/items';
import { isCarriable, weightOf } from '../data/weights';
import { loadRoom, loadWeight } from '../sim/cargo';
import type { GameState } from '../sim/state';
import { vehicleDef } from '../sim/vehicles';
import { effective } from '../data/vehicles';
import { clearChildren, el } from './dom';
import { icon, itemChip } from './icons';

export interface CargoHandlers {
  onLoad(vehicleId: number, item: string, qty: number): void;
  onUnload(vehicleId: number, item: string, qty: number): void;
  onUnloadAll(vehicleId: number): void;
}

/** Loading a vehicle from your storage and unloading it again. Both need you to be at your base, where the storage is. */
export class CargoPanel {
  private readonly panel = el('div', 'cargo-panel');
  private readonly body = el('div', 'cargo-body');
  private readonly title = el('span');
  private open = false;
  private vehicleId = -1;
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly getState: () => GameState, private readonly handlers: CargoHandlers) {
    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.title = 'Close';
    close.addEventListener('click', () => this.hide());
    const head = el('div', 'panel-head');
    head.append(icon('Package', 18), this.title);
    this.panel.append(close, head, this.body);
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(vehicleId: number): void {
    this.vehicleId = vehicleId;
    this.open = true;
    this.panel.style.display = 'flex';
    this.refresh(true);
  }

  hide(): void {
    this.open = false;
    this.panel.style.display = 'none';
  }

  refresh(force = false): void {
    if (!this.open) return;
    const state = this.getState();
    const v = state.vehicles.find((x) => x.id === this.vehicleId);
    if (!v) return this.hide();
    const key = JSON.stringify([v.cargo, state.storage, state.at === 'base', v.parts]);
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const def = vehicleDef(v);
    const max = effective(def, v.parts).cargo;
    const have = loadWeight(v);
    const atBase = state.at === 'base';
    this.title.textContent = `${def.name}: cargo`;
    const scroll = this.body.scrollTop;
    clearChildren(this.body);

    const bar = el('div', 'cargo-bar');
    const fill = el('span', 'cargo-fill');
    fill.style.width = `${Math.min(100, (have / max) * 100)}%`;
    bar.append(fill);
    this.body.append(el('div', 'cargo-cap', `${Math.round(have)} / ${max} kg`), bar);
    if (!atBase) this.body.append(el('div', 'banner warn', 'Park at your base to load and unload. Your storage is there.'));

    this.body.append(el('h4', undefined, 'In the vehicle'));
    const carried = Object.entries(v.cargo).filter(([, n]) => n > 0);
    if (carried.length === 0) this.body.append(el('p', 'empty', 'Nothing yet.'));
    for (const [id, n] of carried) {
      const item = itemById(id);
      const row = el('div', 'line cargo-line');
      row.append(itemChip(item, 16), el('span', 'dim', item.name), el('b', undefined, `x${n}`), el('span', 'dim', `${Math.round(weightOf(id) * n)} kg`));
      row.append(this.button('1', 'Unload one', !atBase, () => this.handlers.onUnload(v.id, id, 1)), this.button('All', 'Unload them all', !atBase, () => this.handlers.onUnload(v.id, id, n)));
      this.body.append(row);
    }
    if (carried.length > 0) {
      const all = el('button', 'tool-btn', 'Unload everything');
      all.disabled = !atBase;
      all.addEventListener('click', () => this.handlers.onUnloadAll(v.id));
      this.body.append(all);
    }

    if (atBase) {
      this.body.append(el('h4', undefined, 'In your storage'));
      const stored = Object.entries(state.storage).filter(([id, n]) => n > 0 && isCarriable(id));
      if (stored.length === 0) this.body.append(el('p', 'empty', 'Nothing you could carry.'));
      for (const [id, n] of stored) {
        const item = itemById(id);
        const w = weightOf(id);
        const fits = Math.min(n, Math.floor(loadRoom(v, state) / w + 1e-6));
        const row = el('div', 'line cargo-line');
        row.append(itemChip(item, 16), el('span', 'dim', item.name), el('b', undefined, `x${n}`), el('span', 'dim', `${w} kg each`));
        row.append(
          this.button('+1', 'Load one', fits < 1, () => this.handlers.onLoad(v.id, id, 1)),
          this.button('Max', `Load ${fits}`, fits < 1, () => this.handlers.onLoad(v.id, id, fits)),
        );
        this.body.append(row);
      }
    }
    this.body.scrollTop = scroll;
  }

  private button(label: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'mini-btn', label);
    b.title = title;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }
}
