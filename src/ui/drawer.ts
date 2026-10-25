import { CATEGORIES, itemById, type Category } from '../data/items';
import { storeInfo } from '../data/stores';
import { isStructure } from '../data/structures';
import { clearChildren, dayTime, duration, el, money } from './dom';
import { categoryChip, icon, iconLabel, itemChip } from './icons';
import { productImage } from './thumb';
import { isReturnable, returnValue } from '../sim/economy';
import type { GameState, Order } from '../sim/state';

export type DrawerTab = 'storage' | 'orders' | 'news';

const TABS: Array<{ id: DrawerTab; label: string; icon: string }> = [
  { id: 'storage', label: 'Storage', icon: 'Package' },
  { id: 'orders', label: 'Orders', icon: 'Truck' },
  { id: 'news', label: 'News', icon: 'Newspaper' },
];

/** Left-hand panel with the base storage, order tracking and the news log. */
export class Drawer {
  private readonly panel = el('div', 'drawer');
  private readonly tabsEl = el('div', 'tabs');
  private readonly body = el('div', 'drawer-body');
  private tab: DrawerTab = 'storage';
  private open = false;
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly onTab: (tab: DrawerTab | null) => void,
    private readonly onPlace: (itemId: string) => void,
    private readonly onReturn: (itemId: string, qty: number) => void,
  ) {
    const close = el('button', 'x');
    close.append(icon('X', 16));
    close.addEventListener('click', () => this.hide());
    this.panel.append(close, this.tabsEl, this.body);
    this.panel.style.display = 'none';
    parent.append(this.panel);
    for (const t of TABS) {
      const b = el('button', 'tab');
      b.append(iconLabel(t.icon, t.label, 15));
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        this.tab = t.id;
        this.lastKey = '';
        this.onTab(t.id);
      });
      this.tabsEl.append(b);
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  get currentTab(): DrawerTab {
    return this.tab;
  }

  show(tab: DrawerTab): void {
    this.tab = tab;
    this.open = true;
    this.lastKey = '';
    this.panel.style.display = 'flex';
    this.onTab(tab);
  }

  hide(): void {
    this.open = false;
    this.panel.style.display = 'none';
    this.onTab(null);
  }

  toggle(tab: DrawerTab): void {
    if (this.open && this.tab === tab) this.hide();
    else this.show(tab);
  }

  /** Redraw only when the content would change. */
  refresh(state: GameState): void {
    if (!this.open) return;
    for (const b of this.tabsEl.querySelectorAll<HTMLElement>('.tab')) {
      b.classList.toggle('active', b.dataset.tab === this.tab);
    }
    const key = this.contentKey(state);
    if (key === this.lastKey) return;
    this.lastKey = key;
    clearChildren(this.body);
    if (this.tab === 'storage') this.renderStorage(state);
    else if (this.tab === 'orders') this.renderOrders(state);
    else this.renderNews(state);
  }

  private contentKey(s: GameState): string {
    if (this.tab === 'storage') return `s|${s.plotId}|${s.phase}|${JSON.stringify(s.storage)}`;
    if (this.tab === 'orders') {
      // Countdowns change with time, so include the minute.
      return `o|${Math.floor(s.worldSeconds / 60)}|${s.orders.map((o) => o.id + o.status).join(',')}`;
    }
    return `n|${s.messages.length}|${s.messages[s.messages.length - 1]?.id ?? 0}`;
  }

  private renderStorage(state: GameState): void {
    if (!state.plotId) {
      this.body.append(el('p', 'empty', 'You do not have a base yet. Buy a plot at Hillside Realty, then order supplies. Deliveries arrive here.'));
      return;
    }
    const entries = Object.entries(state.storage).filter(([, q]) => q > 0);
    if (entries.length === 0) {
      this.body.append(el('p', 'empty', 'Your storage is empty. Visit a shop and place an order; it will be delivered to your base.'));
      return;
    }
    // Structures first: these are the things you can place on your land.
    const structures = entries.filter(([id]) => isStructure(id));
    if (structures.length) {
      this.body.append(el('h4', undefined, 'Ready to place'));
      for (const [id, qty] of structures) {
        const item = itemById(id);
        const row = el('div', 'line structure-line');
        const name = el('span', 'grow icon-label');
        name.append(productImage(item, 48), el('span', undefined, item.name));
        const place = el('button', 'mini-btn', 'Place');
        place.addEventListener('click', () => this.onPlace(id));
        row.append(name, el('b', undefined, `×${qty.toLocaleString('en-US')}`), place, ...this.returnButtons(state, id, qty));
        this.body.append(row);
      }
    }

    const groups = new Map<Category, Array<[string, number]>>();
    for (const [id, qty] of entries) {
      if (isStructure(id)) continue;
      const cat = itemById(id).category;
      const list = groups.get(cat) ?? [];
      list.push([id, qty]);
      groups.set(cat, list);
    }
    for (const cat of Object.keys(CATEGORIES) as Category[]) {
      const list = groups.get(cat);
      if (!list) continue;
      const heading = el('h4', 'icon-label');
      heading.append(categoryChip(cat, 13), el('span', undefined, CATEGORIES[cat].label));
      this.body.append(heading);
      for (const [id, qty] of list) {
        const item = itemById(id);
        const row = el('div', 'line');
        const name = el('span', 'grow icon-label');
        name.append(itemChip(item, 14), el('span', undefined, item.name));
        row.append(name, el('span', 'dim', item.unit), el('b', undefined, `×${qty.toLocaleString('en-US')}`), ...this.returnButtons(state, id, qty));
        this.body.append(row);
      }
    }
  }

  /** Return buttons for a storage row: send one back, or all of them, for a refund. Only while the shops are open. */
  private returnButtons(state: GameState, id: string, qty: number): HTMLElement[] {
    if (state.phase !== 'prep' || !isReturnable(id)) return [];
    const each = returnValue(id);
    const make = (label: string, count: number) => {
      const b = el('button', 'return-btn') as HTMLButtonElement;
      b.append(icon('Undo2', 13), el('span', undefined, label));
      b.title = `Return ${count} to SurvivalMart for ${money(each * count)}`;
      b.addEventListener('click', () => this.onReturn(id, count));
      return b;
    };
    const group = el('span', 'return-group');
    group.append(...(qty > 1 ? [make('1', 1), make('All', qty)] : [make('Return', 1)]));
    return [group];
  }

  private renderOrders(state: GameState): void {
    if (state.orders.length === 0) {
      this.body.append(el('p', 'empty', 'No orders yet. Orders you place at a shop show up here until they are delivered.'));
      return;
    }
    const transit = state.orders.filter((o) => o.status === 'transit');
    const done = state.orders.filter((o) => o.status !== 'transit').reverse();
    if (transit.length) {
      this.body.append(el('h4', undefined, 'On the way'));
      for (const o of transit) this.body.append(this.orderCard(state, o));
    }
    if (done.length) {
      this.body.append(el('h4', undefined, 'Recent'));
      for (const o of done) this.body.append(this.orderCard(state, o));
    }
  }

  private orderCard(state: GameState, o: Order): HTMLElement {
    const card = el('div', `order ${o.status}`);
    const head = el('div', 'line');
    head.append(el('b', 'grow', `#${o.id} ${storeInfo(o.storeId).name}`), el('span', 'dim', money(o.total)));
    card.append(head);
    const parts = Object.entries(o.items).map(([id, q]) => `${q}× ${itemById(id).name}`);
    const shown = parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` and ${parts.length - 3} more` : '');
    card.append(el('div', 'dim', shown));
    const status =
      o.status === 'transit'
        ? `Arrives in ${duration(o.deliverAt - state.worldSeconds)} (${dayTime(o.deliverAt)})`
        : o.status === 'delivered'
          ? 'Delivered to your base'
          : 'Refunded';
    card.append(el('div', o.status === 'transit' ? 'eta' : 'dim', status));
    return card;
  }

  private renderNews(state: GameState): void {
    for (const m of [...state.messages].reverse()) {
      const item = el('div', `msg ${m.kind}`);
      item.append(el('div', 'dim', dayTime(m.worldSeconds)), el('div', undefined, m.text));
      this.body.append(item);
    }
  }
}
