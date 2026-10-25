import { city, type PlotDef, type PlotId } from '../data/city';
import { plotProblem } from '../sim/realty';
import type { GameState } from '../sim/state';
import { button, clearChildren, el, money } from './dom';
import { iconLabel } from './icons';

const WATER_TEXT = { well: 'Working well', stream: 'Stream', none: 'No water source' } as const;

/** Side panel at the real estate office for buying the base plot. */
export class RealtyView {
  private overlay: HTMLElement | null = null;
  private list!: HTMLElement;
  private banner!: HTMLElement;
  private confirming: PlotId | null = null;
  private confirmTimer = 0;
  private lastKey = '';

  constructor(
    private readonly parent: HTMLElement,
    private readonly getState: () => GameState,
    private readonly onBuy: (plotId: PlotId) => boolean,
    private readonly onPreview: (plotId: PlotId | null) => void,
    private readonly onLeave: () => void,
  ) {}

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  open(): void {
    this.close();
    const overlay = el('div', 'modal-overlay side');
    const modal = el('div', 'modal realty');
    const head = el('div', 'modal-head');
    const titles = el('div');
    titles.append(el('h2', undefined, 'Hillside Realty'), el('div', 'dim', 'Choose where your base will stand. You can only buy one plot, so pick carefully.'));
    head.append(titles, button({ label: 'Leave', kind: 'secondary', onClick: () => this.onLeave() }));
    this.banner = el('div', 'banner');
    this.list = el('div', 'plot-list');
    modal.append(head, this.banner, this.list);
    overlay.append(modal);
    this.parent.append(overlay);
    this.overlay = overlay;
    this.lastKey = '';
    this.render();
  }

  close(): void {
    window.clearTimeout(this.confirmTimer);
    this.confirming = null;
    this.overlay?.remove();
    this.overlay = null;
    this.onPreview(null);
  }

  refresh(): void {
    if (this.overlay) this.render();
  }

  private render(): void {
    const state = this.getState();
    // Only redraw when something that affects the view changed, so a click is never lost to a rebuild.
    const key = `${state.plotId}|${state.phase}|${state.at}|${this.confirming}|${city.plots.map((p) => (p.price > state.money ? 1 : 0)).join('')}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    // Emptying the list shrinks the panel, which would throw the scroll position back to the top.
    const scroller = this.overlay?.querySelector<HTMLElement>('.modal') ?? null;
    const scrollTop = scroller?.scrollTop ?? 0;
    clearChildren(this.list);
    if (state.plotId) {
      this.banner.textContent = 'You own your base plot. Next, order supplies from the shops.';
      this.banner.className = 'banner';
    } else if (state.phase !== 'prep') {
      this.banner.textContent = 'The office has closed.';
      this.banner.className = 'banner bad';
    } else {
      this.banner.textContent = 'Defense matters most once the zombies arrive, but farmland and water keep you alive.';
      this.banner.className = 'banner';
    }
    for (const plot of city.plots) this.list.append(this.plotCard(state, plot));
    if (scroller) scroller.scrollTop = scrollTop;
  }

  private plotCard(state: GameState, plot: PlotDef): HTMLElement {
    const owned = state.plotId === plot.id;
    const card = el('div', `plot-card${owned ? ' owned' : ''}`);
    card.addEventListener('mouseenter', () => this.onPreview(plot.id));
    card.addEventListener('mouseleave', () => this.onPreview(null));

    const top = el('div', 'line');
    top.append(el('h3', 'grow', plot.name), el('b', 'price', money(plot.price)));
    card.append(top, el('p', 'dim', plot.blurb));

    const stats = el('div', 'stats');
    const stat = (label: string, value: string) => {
      const s = el('div', 'stat');
      s.append(el('span', 'dim', label), el('b', undefined, value));
      stats.append(s);
    };
    stat('Size', `${plot.bounds.w} × ${plot.bounds.d} m`);
    stat('Water', WATER_TEXT[plot.water]);
    stat('Defense', `${plot.defense} / 5`);
    card.append(stats);

    if (owned) {
      const tag = el('div', 'owned-tag');
      tag.append(iconLabel('Check', 'Your base', 16));
      card.append(tag);
      return card;
    }
    const problem = plotProblem(state, plot.id);
    const confirming = this.confirming === plot.id;
    const btn = button({
      label: confirming ? `Click again to pay ${money(plot.price)}` : 'Buy this plot',
      kind: confirming ? 'danger' : 'good',
      disabled: problem !== null,
      onClick: () => {
        if (this.confirming !== plot.id) {
          this.confirming = plot.id;
          window.clearTimeout(this.confirmTimer);
          this.confirmTimer = window.setTimeout(() => {
            this.confirming = null;
            this.refresh();
          }, 8000);
          this.render();
          return;
        }
        this.confirming = null;
        window.clearTimeout(this.confirmTimer);
        this.onBuy(plot.id);
        this.render();
      },
    });
    card.append(btn);
    if (problem) card.append(el('div', 'warn small', problem));
    return card;
  }
}
