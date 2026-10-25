import { itemById } from '../data/items';
import { productInfo, productKind } from '../data/info';
import { el, money } from './dom';
import { icon } from './icons';
import { productImage } from './thumb';

/** What the sheet needs from the store it sits in. */
export interface SheetHost {
  price(itemId: string): number;
  stock(itemId: string): number;
  qty(itemId: string): number;
  setQty(itemId: string, qty: number): void;
  /** False when the shop is closed or there is nowhere to deliver. */
  canBuy(): boolean;
}

/** Which small icon goes with a requirement line. */
function needIcon(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('power')) return 'Zap';
  if (t.includes('gasoline') || t.includes('fuel')) return 'Fuel';
  if (t.includes('seed')) return 'Sprout';
  if (t.includes('feed')) return 'Wheat';
  if (t.includes('water')) return 'Droplet';
  return 'Check';
}

/**
 * The product sheet: opens over the list when you click a product, and explains it. What it is, how it works in this
 * game, what it needs, and the numbers. The buy controls are on the sheet too, so you do not have to go back.
 */
export class ProductSheet {
  readonly root = el('div', 'sheet');
  private itemId: string | null = null;
  private priceEl = el('div', 'sheet-price');
  private stockEl = el('div', 'sheet-stock');
  private input = el('input', 'qty') as HTMLInputElement;
  private minus = el('button', 'qbtn', '\u2212') as HTMLButtonElement;
  private plus = el('button', 'qbtn', '+') as HTMLButtonElement;
  private plus10 = el('button', 'qbtn wide', '+10') as HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly host: SheetHost) {
    this.root.style.display = 'none';
    parent.append(this.root);
    this.input.type = 'number';
    this.input.min = '0';
    this.input.addEventListener('change', () => this.set(Number(this.input.value)));
    this.minus.addEventListener('click', () => this.set(this.qty() - 1));
    this.plus.addEventListener('click', () => this.set(this.qty() + 1));
    this.plus10.addEventListener('click', () => this.set(this.qty() + 10));
  }

  get isOpen(): boolean {
    return this.itemId !== null;
  }

  get current(): string | null {
    return this.itemId;
  }

  private qty(): number {
    return this.itemId ? this.host.qty(this.itemId) : 0;
  }

  private set(q: number): void {
    if (!this.itemId) return;
    this.host.setQty(this.itemId, q);
    this.refresh();
  }

  show(itemId: string): void {
    const item = itemById(itemId);
    const info = productInfo(itemId);
    this.itemId = itemId;
    this.root.replaceChildren();

    const back = el('button', 'sheet-back');
    back.append(icon('ChevronLeft', 16), el('span', undefined, 'Back to the list'));
    back.addEventListener('click', () => this.hide());

    // Top: picture, name, price, buy controls
    const top = el('div', 'sheet-top');
    const picture = productImage(item, 168);
    picture.classList.add('sheet-picture');
    const head = el('div', 'sheet-head');
    const tag = el('span', `sheet-tag ${info.status.level}`);
    tag.append(icon(info.status.level === 'works' ? 'Check' : info.status.level === 'soon' ? 'Hourglass' : 'Leaf', 13), el('span', undefined, info.status.label));
    head.append(el('div', 'sheet-kind', productKind(itemId)), el('h2', 'sheet-name', item.name), tag);
    const buy = el('div', 'sheet-buy');
    const controls = el('div', 'qty-controls');
    controls.append(this.minus, this.input, this.plus, this.plus10);
    const priceBox = el('div', 'sheet-pricebox');
    priceBox.append(this.priceEl, this.stockEl);
    buy.append(priceBox, controls);
    head.append(buy);
    top.append(picture, head);

    const body = el('div', 'sheet-body');
    const section = (title: string, content: HTMLElement) => {
      const s = el('div', 'sheet-section');
      s.append(el('h4', undefined, title), content);
      body.append(s);
    };
    section('What it is', el('p', 'sheet-what', info.what));
    if (info.how.length) {
      const list = el('ul', 'sheet-list');
      for (const line of info.how) list.append(el('li', undefined, line));
      section('How it works', list);
    }
    if (info.needs.length) {
      const list = el('div', 'sheet-needs');
      for (const need of info.needs) {
        const row = el('div', 'sheet-need');
        row.append(icon(needIcon(need), 15), el('span', undefined, need));
        list.append(row);
      }
      section('What it needs', list);
    }
    if (info.stats.length) {
      const grid = el('div', 'sheet-stats');
      for (const s of info.stats) {
        const tile = el('div', 'sheet-stat');
        tile.append(el('span', 'sheet-stat-label', s.label), el('span', 'sheet-stat-value', s.value));
        grid.append(tile);
      }
      section('The numbers', grid);
    }

    this.root.append(back, top, body);
    this.root.style.display = '';
    this.root.scrollTop = 0;
    this.refresh();
  }

  hide(): void {
    this.itemId = null;
    this.root.style.display = 'none';
    this.root.replaceChildren();
  }

  /** Update price, stock and the amount in the order. Safe to call often. */
  refresh(): void {
    if (!this.itemId) return;
    const id = this.itemId;
    const have = this.host.stock(id);
    const q = this.host.qty(id);
    const open = this.host.canBuy();
    const price = money(this.host.price(id));
    if (this.priceEl.textContent !== price) this.priceEl.textContent = price;
    const stock = have > 0 ? `${have.toLocaleString('en-US')} in stock` : 'Sold out';
    if (this.stockEl.textContent !== stock) this.stockEl.textContent = stock;
    this.stockEl.classList.toggle('out', have === 0);
    if (document.activeElement !== this.input) this.input.value = String(q);
    this.minus.disabled = q <= 0;
    this.plus.disabled = q >= have || !open;
    this.plus10.disabled = q >= have || !open;
    this.input.disabled = !open || have === 0;
  }
}
