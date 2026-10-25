import { BUILDING_CATEGORIES, CATEGORIES, itemById, type Category } from '../data/items';
import { ONLINE_STORE_ID, storeById, storeInfo, type StoreId } from '../data/stores';
import {
  isStoreOpen, itemPrice, orderProblem, panicMultiplier, quote, stockOf,
  type Cart, type OrderResult,
} from '../sim/economy';
import type { GameState } from '../sim/state';
import { button, clearChildren, el, money } from './dom';
import { icon, iconLabel } from './icons';
import { ProductSheet } from './product-sheet';
import { productImage } from './thumb';

interface Row {
  itemId: string;
  category: Category;
  root: HTMLElement;
  price: HTMLElement;
  badge: HTMLElement;
  stock: HTMLElement;
  input: HTMLInputElement;
  minus: HTMLButtonElement;
  plus: HTMLButtonElement;
  plus10: HTMLButtonElement;
}

export class ShopView {
  private overlay: HTMLElement | null = null;
  private storeId: StoreId | null = null;
  private search = '';
  private readonly carts = new Map<string, Cart>();
  private rows: Row[] = [];
  private category: Category | 'all' = 'all';
  private banner!: HTMLElement;
  private cartList!: HTMLElement;
  private totals!: HTMLElement;
  private orderBtn!: HTMLButtonElement;
  private buildBtn!: HTMLButtonElement;
  private orderNote!: HTMLElement;
  private tabButtons = new Map<string, HTMLElement>();
  private sheet: ProductSheet | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly getState: () => GameState,
    private readonly onOrder: (storeId: StoreId, cart: Cart) => OrderResult,
    private readonly onLeave: () => void,
    /** Close the store and start placing what you bought. */
    private readonly onBuildNow: () => void,
  ) {}

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  get currentStore(): StoreId | null {
    return this.storeId;
  }

  open(storeId: StoreId): void {
    this.close();
    const store = storeById(storeId);
    if (!store) return;
    this.storeId = storeId;
    if (!this.carts.has(storeId)) this.carts.set(storeId, {});
    const info = storeInfo(storeId);
    const online = storeId === ONLINE_STORE_ID;
    this.search = '';

    const overlay = el('div', 'modal-overlay');
    const modal = el('div', online ? 'modal shop online' : 'modal shop');
    overlay.append(modal);

    // Header
    const head = el('div', 'modal-head');
    const titles = el('div');
    const title = el('h2', 'icon-label');
    if (online) title.append(icon('ShoppingCart', 22));
    title.append(el('span', undefined, info.name));
    titles.append(title, el('div', 'dim', info.blurb));
    head.append(titles, button({ label: 'Close', kind: 'secondary', onClick: () => this.onLeave() }));
    modal.append(head);

    this.banner = el('div', 'banner');
    modal.append(this.banner);

    const body = el('div', 'shop-body');
    modal.append(body);

    // Left: search + items (+ categories for town shops)
    const left = el('div', 'shop-left');
    const tabs = el('div', online ? 'cat-tabs vertical' : 'cat-tabs');
    this.tabButtons.clear();
    const cats = new Set<Category>(store.stock.map(([id]) => itemById(id).category));
    const addTab = (id: Category | 'all', label: string, iconName?: string) => {
      const b = el('button', 'cat-tab');
      b.append(iconName ? iconLabel(iconName, label, 14) : el('span', undefined, label));
      b.addEventListener('click', () => {
        this.category = id;
        this.sheet?.hide();
        this.applyCategory();
      });
      this.tabButtons.set(id, b);
      tabs.append(b);
    };
    addTab('all', 'Everything');
    const order = Object.keys(CATEGORIES) as Category[];
    if (online) tabs.append(el('div', 'cat-heading', 'For your base'));
    let shownSupplies = false;
    for (const c of order) {
      if (!cats.has(c)) continue;
      if (online && !shownSupplies && !BUILDING_CATEGORIES.includes(c) && c !== 'materials' && c !== 'tools') {
        tabs.append(el('div', 'cat-heading', 'Supplies'));
        shownSupplies = true;
      }
      addTab(c, CATEGORIES[c].label, CATEGORIES[c].icon);
    }
    const searchBox = el('input', 'search') as HTMLInputElement;
    searchBox.type = 'search';
    searchBox.placeholder = online ? 'Search fences, houses, ponds, trees...' : 'Search this shop';
    searchBox.addEventListener('input', () => {
      this.search = searchBox.value.trim().toLowerCase();
      this.sheet?.hide();
      this.applyCategory();
    });
    const searchWrap = el('div', 'search-wrap');
    searchWrap.append(icon('Search', 16), searchBox);
    left.append(searchWrap);
    if (!online) left.append(tabs);

    const list = el('div', 'item-list');
    this.rows = [];
    const cart = this.carts.get(storeId)!;
    // Building products first in the online store
    const stock = [...store.stock].sort(
      (a, b) => order.indexOf(itemById(a[0]).category) - order.indexOf(itemById(b[0]).category),
    );
    for (const [itemId] of stock) {
      const item = itemById(itemId);
      const root = el('div', 'item-row');
      root.title = 'Click for details';
      root.append(productImage(item, 64));
      const infoBox = el('div', 'item-info');
      const nameLine = el('div', 'item-name');
      const infoIcon = el('span', 'info-dot');
      infoIcon.append(icon('Info', 14));
      nameLine.append(el('span', undefined, item.name), infoIcon);
      infoBox.append(nameLine, el('div', 'dim item-unit', item.note ?? item.unit));
      // Anywhere on the row opens the product sheet, except the buying controls
      root.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.qty-controls')) return;
        this.sheet?.show(itemId);
      });
      const price = el('div', 'item-price');
      const badge = el('span', 'badge');
      const stockEl = el('div', 'item-stock');
      const input = el('input', 'qty') as HTMLInputElement;
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = String(cart[itemId] ?? 0);
      const setQty = (q: number) => {
        this.setQuantity(itemId, q);
        input.value = String(cart[itemId] ?? 0);
      };
      input.addEventListener('change', () => setQty(Number(input.value)));
      const minus = el('button', 'qbtn', '−');
      const plus = el('button', 'qbtn', '+');
      const plus10 = el('button', 'qbtn wide', '+10');
      minus.addEventListener('click', () => setQty((cart[itemId] ?? 0) - 1));
      plus.addEventListener('click', () => setQty((cart[itemId] ?? 0) + 1));
      plus10.addEventListener('click', () => setQty((cart[itemId] ?? 0) + 10));
      const controls = el('div', 'qty-controls');
      controls.append(minus, input, plus, plus10);
      const priceWrap = el('div', 'item-pricewrap');
      priceWrap.append(price, badge);
      root.append(infoBox, priceWrap, stockEl, controls);
      list.append(root);
      this.rows.push({ itemId, category: item.category, root, price, badge, stock: stockEl, input, minus, plus, plus10 });
    }
    left.append(list);
    this.sheet = new ProductSheet(left, {
      price: (id) => itemPrice(storeId, id, this.getState().worldSeconds),
      stock: (id) => stockOf(this.getState(), storeId, id),
      qty: (id) => cart[id] ?? 0,
      setQty: (id, q) => this.setQuantity(id, q),
      canBuy: () => isStoreOpen(this.getState(), storeId),
    });

    // Right: cart
    const right = el('div', 'shop-right');
    right.append(el('h3', undefined, 'Your order'));
    this.cartList = el('div', 'cart-list');
    this.totals = el('div', 'totals');
    this.orderNote = el('div', 'order-note');
    this.orderBtn = button({ label: 'Buy now', kind: 'good', onClick: () => this.placeOrder() });
    const clear = button({
      label: 'Clear cart',
      kind: 'secondary',
      onClick: () => {
        const c = this.carts.get(storeId)!;
        for (const k of Object.keys(c)) delete c[k];
        for (const r of this.rows) r.input.value = '0';
        this.refresh();
      },
    });
    this.buildBtn = button({ label: 'Go build with it', kind: 'secondary', onClick: () => this.onBuildNow() });
    right.append(this.cartList, this.totals, this.orderNote, this.orderBtn, clear, this.buildBtn);

    if (online) {
      const side = el('div', 'cat-side');
      side.append(tabs);
      body.append(side, left, right);
    } else {
      body.append(left, right);
    }
    this.parent.append(overlay);
    this.overlay = overlay;
    // The online store opens on the first building category: this is a game about building a base.
    this.category = online ? BUILDING_CATEGORIES.find((c) => cats.has(c)) ?? 'all' : 'all';
    this.applyCategory();
    this.refresh();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.storeId = null;
    this.rows = [];
    this.sheet = null;
  }

  /** Close the product sheet if it is open. Returns true if there was one (so Esc closes it before the shop). */
  closeSheet(): boolean {
    if (!this.sheet?.isOpen) return false;
    this.sheet.hide();
    return true;
  }

  /** Open the product sheet for an item (also used by tests). */
  showProduct(itemId: string): void {
    this.sheet?.show(itemId);
  }

  /** Set how many of an item are in the order, within the stock that is available. */
  private setQuantity(itemId: string, q: number): void {
    if (!this.storeId) return;
    const cart = this.carts.get(this.storeId)!;
    const max = stockOf(this.getState(), this.storeId, itemId);
    const clean = Math.max(0, Math.min(max, Math.floor(Number.isFinite(q) ? q : 0)));
    if (clean > 0) cart[itemId] = clean;
    else delete cart[itemId];
    this.refresh();
  }

  /** Jump to a category while the shop is open (used by the advisor's "Browse" buttons). */
  showCategory(category: Category): void {
    if (!this.overlay || !this.tabButtons.has(category)) return;
    this.category = category;
    this.applyCategory();
  }

  private applyCategory(): void {
    for (const [id, b] of this.tabButtons) b.classList.toggle('active', id === this.category);
    for (const r of this.rows) {
      const inCategory = this.category === 'all' || r.category === this.category;
      const matches = !this.search || itemById(r.itemId).name.toLowerCase().includes(this.search);
      r.root.style.display = inCategory && matches ? '' : 'none';
    }
  }

  private placeOrder(): void {
    if (!this.storeId) return;
    const cart = this.carts.get(this.storeId)!;
    const result = this.onOrder(this.storeId, cart);
    if (result.ok) {
      for (const k of Object.keys(cart)) delete cart[k];
      for (const r of this.rows) r.input.value = '0';
    }
    this.refresh();
  }

  /** Update prices, stock and totals from the current state. Safe to call often. */
  refresh(): void {
    if (!this.overlay || !this.storeId) return;
    const state = this.getState();
    const storeId = this.storeId;
    const cart = this.carts.get(storeId)!;
    const open = isStoreOpen(state, storeId);

    // Banner
    if (!open) {
      this.banner.textContent = 'This shop has closed. Nobody is coming back.';
      this.banner.className = 'banner bad';
    } else if (!state.plotId) {
      this.banner.textContent = 'You have no base yet. Buy a plot at Hillside Realty first, so there is somewhere to keep what you buy.';
      this.banner.className = 'banner warn';
    } else {
      this.banner.textContent = 'Instant delivery: everything you buy goes straight into your storage.';
      this.banner.className = 'banner';
    }

    for (const r of this.rows) {
      const have = stockOf(state, storeId, r.itemId);
      const mult = panicMultiplier(r.itemId, state.worldSeconds);
      r.price.textContent = money(itemPrice(storeId, r.itemId, state.worldSeconds));
      const pct = mult > 1.04 ? Math.round((mult - 1) * 100) : 0;
      if (r.badge.dataset.pct !== String(pct)) {
        r.badge.dataset.pct = String(pct);
        r.badge.replaceChildren(...(pct ? [icon('TrendingUp', 12), document.createTextNode(` ${pct}%`)] : []));
      }
      r.stock.textContent = have > 0 ? `${have.toLocaleString('en-US')} in stock` : 'Sold out';
      r.stock.classList.toggle('out', have === 0);
      // Keep the cart inside the stock that is actually available.
      if ((cart[r.itemId] ?? 0) > have) {
        if (have > 0) cart[r.itemId] = have;
        else delete cart[r.itemId];
      }
      const q = cart[r.itemId] ?? 0;
      if (document.activeElement !== r.input) r.input.value = String(q);
      r.minus.disabled = q <= 0;
      r.plus.disabled = q >= have || !open;
      r.plus10.disabled = q >= have || !open;
      r.input.disabled = !open || have === 0;
      r.root.classList.toggle('in-cart', q > 0);
    }

    // Cart summary
    clearChildren(this.cartList);
    const lines = Object.entries(cart).filter(([, q]) => q > 0);
    if (lines.length === 0) this.cartList.append(el('p', 'empty', 'Nothing selected yet.'));
    for (const [itemId, q] of lines) {
      const item = itemById(itemId);
      const row = el('div', 'line');
      row.append(
        el('span', 'grow', `${q}× ${item.name}`),
        el('span', undefined, money(q * itemPrice(storeId, itemId, state.worldSeconds))),
      );
      this.cartList.append(row);
    }

    const qt = quote(state, storeId, cart);
    clearChildren(this.totals);
    const totalLine = (label: string, value: string, cls?: string) => {
      const l = el('div', `line ${cls ?? ''}`);
      l.append(el('span', 'grow', label), el('span', undefined, value));
      this.totals.append(l);
    };
    totalLine('Total', money(qt.total), 'total');
    totalLine('Money after', money(state.money - qt.total), state.money - qt.total < 0 ? 'neg' : 'dim');
    this.orderNote.textContent = '';

    const problem = lines.length === 0 ? null : orderProblem(state, storeId, cart);
    this.orderBtn.disabled = lines.length === 0 || problem !== null;
    this.orderBtn.title = problem ?? '';
    if (problem) this.orderNote.textContent = problem;
    this.buildBtn.style.display = state.plotId && state.phase === 'prep' ? '' : 'none';
    this.sheet?.refresh();
  }
}
