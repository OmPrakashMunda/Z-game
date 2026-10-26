import { CLOTHING, SLOTS, SLOT_ICONS, SLOT_NAMES, outfitStats, type Slot } from '../data/clothing';
import { itemById } from '../data/items';
import { wearableOnHand } from '../sim/outfit';
import type { Exposure } from '../sim/exposure';
import type { GameState } from '../sim/state';
import { clearChildren, el } from './dom';
import { icon } from './icons';

export interface CharacterHandlers {
  onWear(itemId: string): void;
  onTakeOff(slot: Slot): void;
}

const STATUS_TEXT: Record<Exposure['status'], string> = {
  ok: 'Comfortable',
  wet: 'Wet',
  cold: 'Cold',
  freezing: 'Freezing',
  hot: 'Overheating',
};

/** Who you are and what you wear: the name, warmth and dryness, how the weather is treating you, and the five clothing slots. */
export class CharacterPanel {
  private readonly panel = el('div', 'character');
  private open = false;
  private pick: Slot | null = null;
  private lastKey = '';

  constructor(parent: HTMLElement, private readonly handlers: CharacterHandlers) {
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  hide(): void {
    this.panel.style.display = 'none';
    this.lastKey = '';
  }

  /** Redraw when something it shows has changed, so a click is never lost to a rebuild. */
  update(state: GameState, exposure: Exposure, feltText: string): void {
    this.panel.style.display = 'block';
    const stats = outfitStats(state.outfit);
    const hand = wearableOnHand(state);
    const key = JSON.stringify([
      state.character, state.outfit, Math.round(state.wet * 20), exposure.status, exposure.sheltered, Math.round(exposure.hpPerHour * 10),
      this.open, this.pick, hand.map((h) => [h.id, h.count]), feltText,
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    clearChildren(this.panel);

    const head = el('button', 'char-head');
    head.append(icon(state.character.gender === 'female' ? 'Venus' : 'Mars', 18), el('span', 'char-name', state.character.name));
    head.append(el('span', 'spacer'), icon(this.open ? 'ChevronUp' : 'ChevronDown', 16));
    head.title = this.open ? 'Hide your clothes' : 'Show your clothes';
    head.addEventListener('click', () => {
      this.open = !this.open;
      this.pick = null;
      this.lastKey = '';
      this.update(state, exposure, feltText);
    });
    this.panel.append(head);

    const meters = el('div', 'char-meters');
    meters.append(this.meter('Warm', 'Flame', stats.warmth, 'warm'), this.meter('Dry', 'Droplets', stats.dry, 'dry'));
    this.panel.append(meters);

    const line = el('div', `char-status ${exposure.status !== 'ok' ? 'bad' : ''}`);
    const where = exposure.sheltered ? 'Under cover' : 'Out in the open';
    line.append(icon(exposure.sheltered ? 'House' : 'Wind', 14), el('span', undefined, `${where}. ${STATUS_TEXT[exposure.status]}${state.wet > 0.15 ? `, ${Math.round(state.wet * 100)}% wet` : ''}.`));
    this.panel.append(line);
    if (exposure.hpPerHour > 0.05) {
      this.panel.append(el('div', 'char-loss', `The weather costs you ${exposure.hpPerHour.toFixed(1)} health an hour. ${feltText}`));
    }

    if (!this.open) return;
    const list = el('div', 'char-slots');
    for (const slot of SLOTS) {
      const id = state.outfit[slot];
      const row = el('button', `char-slot ${this.pick === slot ? 'active' : ''}`);
      row.append(icon(SLOT_ICONS[slot], 16), el('span', 'char-slot-name', SLOT_NAMES[slot]), el('span', 'char-slot-item', id ? itemById(id).name : 'Nothing'));
      if (id) {
        const c = CLOTHING[id];
        row.append(el('span', 'char-slot-nums', `${Math.round(c.warmth * 100)} / ${Math.round(c.dry * 100)}`));
      }
      row.addEventListener('click', () => {
        this.pick = this.pick === slot ? null : slot;
        this.lastKey = '';
        this.update(state, exposure, feltText);
      });
      list.append(row);
      if (this.pick === slot) list.append(this.picker(slot, state, hand));
    }
    this.panel.append(list, el('div', 'char-hint', 'Numbers are warmth / dryness. Clothes are not drawn on you.'));
  }

  private meter(label: string, iconName: string, value: number, cls: string): HTMLElement {
    const m = el('div', 'char-meter');
    const bar = el('span', 'char-bar');
    const fill = el('span', `char-fill ${cls}`);
    fill.style.width = `${Math.round(Math.min(1, value / 0.8) * 100)}%`;
    bar.append(fill);
    m.append(icon(iconName, 14), el('span', 'char-meter-label', label), bar, el('b', undefined, `${Math.round(value * 100)}%`));
    return m;
  }

  private picker(slot: Slot, state: GameState, hand: ReturnType<typeof wearableOnHand>): HTMLElement {
    const box = el('div', 'char-picker');
    const options = hand.filter((h) => h.slot === slot);
    if (state.outfit[slot]) {
      const off = el('button', 'mini-btn', 'Take off');
      off.addEventListener('click', () => this.handlers.onTakeOff(slot));
      box.append(el('div', 'line'), off);
    }
    if (options.length === 0) {
      box.append(el('p', 'empty', state.at === 'base' ? 'Nothing to put on here. Buy or find some.' : 'Nothing in your backpack for this. Storage is at your base.'));
    }
    for (const o of options) {
      const c = CLOTHING[o.id];
      const row = el('div', 'line');
      const btn = el('button', 'mini-btn', 'Wear');
      btn.addEventListener('click', () => this.handlers.onWear(o.id));
      row.append(el('span', 'dim', `${itemById(o.id).name} x${o.count}`), el('span', 'dim', `${Math.round(c.warmth * 100)} / ${Math.round(c.dry * 100)}`), btn);
      box.append(row);
    }
    return box;
  }
}
