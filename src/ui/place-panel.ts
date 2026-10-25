import { button, clearChildren, el, type ButtonSpec } from './dom';
import { icon } from './icons';

export interface PlaceInfo {
  title: string;
  subtitle?: string;
  text?: string;
  stats?: Array<[string, string]>;
  notice?: string;
  actions: ButtonSpec[];
}

/** Right-hand card shown when the player clicks a place on the map. */
export class PlacePanel {
  private readonly panel = el('div', 'place-panel');
  private open = false;
  private signature = '';

  constructor(parent: HTMLElement, private readonly onClose: () => void) {
    this.panel.style.display = 'none';
    parent.append(this.panel);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(info: PlaceInfo): void {
    // Skip the redraw when nothing visible changed, so buttons are not replaced under the cursor.
    const signature = JSON.stringify([
      info.title, info.subtitle, info.text, info.stats, info.notice,
      info.actions.map((a) => [a.label, a.disabled, a.kind]),
    ]);
    if (this.open && signature === this.signature) return;
    this.signature = signature;
    this.open = true;
    this.panel.style.display = 'block';
    clearChildren(this.panel);
    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.addEventListener('click', () => this.onClose());
    this.panel.append(close, el('h2', undefined, info.title));
    if (info.subtitle) this.panel.append(el('div', 'dim', info.subtitle));
    if (info.text) this.panel.append(el('p', undefined, info.text));
    if (info.stats) {
      const stats = el('div', 'stats');
      for (const [label, value] of info.stats) {
        const s = el('div', 'stat');
        s.append(el('span', 'dim', label), el('b', undefined, value));
        stats.append(s);
      }
      this.panel.append(stats);
    }
    if (info.notice) this.panel.append(el('div', 'banner warn', info.notice));
    const btns = el('div', 'btns');
    for (const a of info.actions) btns.append(button(a));
    this.panel.append(btns);
  }

  hide(): void {
    this.open = false;
    this.signature = '';
    this.panel.style.display = 'none';
  }
}
