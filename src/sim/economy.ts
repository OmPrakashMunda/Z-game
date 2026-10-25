import { balance, DAY } from '../data/balance';
import { CATEGORIES, itemById } from '../data/items';
import { ONLINE_STORE_ID, STORES, storeById, storeInfo, type StoreId } from '../data/stores';
import { addMessage } from './messages';
import type { GameState, Order } from './state';
import { runtimeOf } from './utilities';

export type Cart = Record<string, number>;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** 0 before the panic starts, rising smoothly to 1 when the outbreak begins. */
export function panicLevel(worldSeconds: number): number {
  const start = balance.panicStartDay - 1;
  const t = clamp((worldSeconds / DAY - start) / (balance.outbreakDay - balance.panicStartDay), 0, 1);
  return Math.pow(t, 1.5);
}

/** Price multiplier caused by panic buying for one item (1 = normal). */
export function panicMultiplier(itemId: string, worldSeconds: number): number {
  return 1 + panicLevel(worldSeconds) * CATEGORIES[itemById(itemId).category].panic;
}

export function itemPrice(storeId: string, itemId: string, worldSeconds: number): number {
  const store = storeById(storeId);
  if (!store) throw new Error(`Unknown store ${storeId}`);
  const price = itemById(itemId).price * store.markup * panicMultiplier(itemId, worldSeconds);
  return Math.max(1, Math.round(price));
}

function normalStock(storeId: string, itemId: string): number {
  const entry = storeById(storeId)?.stock.find(([id]) => id === itemId);
  return entry ? entry[1] : 0;
}

/** The most a store can hold right now. Panic buying empties shelves. */
export function stockCap(storeId: string, itemId: string, worldSeconds: number): number {
  const w = CATEGORIES[itemById(itemId).category].panic;
  const cut = Math.min(0.95, balance.panicStockCut * panicLevel(worldSeconds) * w);
  return Math.floor(normalStock(storeId, itemId) * (1 - cut));
}

export function stockOf(state: GameState, storeId: string, itemId: string): number {
  return state.stores[storeId]?.[itemId] ?? 0;
}

export function isStoreOpen(state: GameState, storeId: string): boolean {
  return state.phase === 'prep' && storeById(storeId) !== undefined;
}

/** Called once per game day: restock shelves toward the cap, and apply panic cuts. */
export function dailyRestock(state: GameState): void {
  for (const store of Object.values(STORES)) {
    if (!store) continue;
    const stock = (state.stores[store.id] ??= {});
    for (const [itemId, normal] of store.stock) {
      const cap = stockCap(store.id, itemId, state.worldSeconds);
      const current = stock[itemId] ?? 0;
      if (current > cap) stock[itemId] = cap;
      else stock[itemId] = Math.min(cap, current + Math.ceil(normal * balance.dailyRestockRate));
    }
  }
}

export interface Quote {
  subtotal: number;
  total: number;
}

export function quote(state: GameState, storeId: string, cart: Cart): Quote {
  if (runtimeOf(state).cheats.freeShop) return { subtotal: 0, total: 0 };
  let subtotal = 0;
  for (const [itemId, qty] of Object.entries(cart)) {
    if (qty > 0) subtotal += qty * itemPrice(storeId, itemId, state.worldSeconds);
  }
  return { subtotal, total: subtotal };
}

export type OrderResult = { ok: true; order: Order } | { ok: false; reason: string };

/** Check an order without changing anything. Returns an explanation if it cannot be placed. */
export function orderProblem(state: GameState, storeId: string, cart: Cart): string | null {
  const store = storeById(storeId);
  if (!store) return 'This place does not sell supplies.';
  if (state.phase !== 'prep') return 'The shops have closed.';
  if (storeId !== ONLINE_STORE_ID && state.at !== storeId) return 'You need to be at the store to order.';
  if (!state.plotId) return 'Buy a base plot first, so there is somewhere to keep your purchases.';

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  if (lines.length === 0) return 'Your cart is empty.';
  for (const [itemId, qty] of lines) {
    if (!Number.isInteger(qty)) return 'Quantities must be whole numbers.';
    const have = stockOf(state, storeId, itemId);
    if (qty > have) return `Not enough ${itemById(itemId).name} in stock (${have} left).`;
  }
  const q = quote(state, storeId, cart);
  if (q.total > state.money) return `You need $${(q.total - state.money).toLocaleString('en-US')} more.`;
  return null;
}

export function placeOrder(state: GameState, storeId: StoreId, cart: Cart): OrderResult {
  const problem = orderProblem(state, storeId, cart);
  if (problem) return { ok: false, reason: problem };

  const q = quote(state, storeId, cart);
  const items: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(cart)) {
    if (qty <= 0) continue;
    items[itemId] = qty;
    state.stores[storeId][itemId] -= qty;
  }
  state.money -= q.total;
  const order: Order = {
    id: state.nextId++,
    storeId,
    items,
    subtotal: q.subtotal,
    fee: 0,
    total: q.total,
    placedAt: state.worldSeconds,
    deliverAt: state.worldSeconds,
    status: 'delivered',
  };
  state.orders.push(order);
  // Delivery is instant: everything goes straight into storage.
  for (const [itemId, qty] of Object.entries(items)) state.storage[itemId] = (state.storage[itemId] ?? 0) + qty;
  const count = Object.values(items).reduce((a, b) => a + b, 0);
  addMessage(state, `Order #${order.id} from ${storeInfo(storeId).name}: ${count} item${count === 1 ? '' : 's'} added to your storage.`, 'order');
  trimFinishedOrders(state);
  return { ok: true, order };
}

/** Sandbox top-up requested by the player. Adds money and says so in the news log. */
export const SANDBOX_FUNDS = 500_000;

export function grantFunds(state: GameState, amount = SANDBOX_FUNDS): void {
  state.money += amount;
  addMessage(state, `Sandbox funds: $${amount.toLocaleString('en-US')} added to your account.`, 'info');
}

const KEEP_FINISHED_ORDERS = 8;

/** Move orders that were still on the way (from older saves) into storage. */
export function processDeliveries(state: GameState): void {
  let changed = false;
  for (const order of state.orders) {
    if (order.status !== 'transit' || order.deliverAt > state.worldSeconds) continue;
    for (const [itemId, qty] of Object.entries(order.items)) {
      state.storage[itemId] = (state.storage[itemId] ?? 0) + qty;
    }
    order.status = 'delivered';
    changed = true;
    addMessage(state, `Order #${order.id} from ${storeInfo(order.storeId).name} was delivered to your storage.`, 'order');
  }
  if (changed) trimFinishedOrders(state);
}

function trimFinishedOrders(state: GameState): void {
  const finished = state.orders.filter((o) => o.status !== 'transit');
  const excess = finished.length - KEEP_FINISHED_ORDERS;
  if (excess <= 0) return;
  const drop = new Set(finished.slice(0, excess).map((o) => o.id));
  state.orders = state.orders.filter((o) => !drop.has(o.id));
}

/** Orders still in transit when the shops close are refunded in full. */
export function refundPendingOrders(state: GameState): void {
  for (const order of state.orders) {
    if (order.status !== 'transit') continue;
    state.money += order.total;
    order.status = 'refunded';
    addMessage(
      state,
      `Order #${order.id} from ${storeInfo(order.storeId).name} could not be delivered. You were refunded $${order.total.toLocaleString('en-US')}.`,
      'warning',
    );
  }
  trimFinishedOrders(state);
}

// ---------------------------------------------------------------- Returns

/** What one unit is worth if you send it back. It ignores panic pricing, so returning can never earn more than the item cost. */
export function returnValue(itemId: string): number {
  const markup = storeById(ONLINE_STORE_ID)?.markup ?? 1;
  return Math.max(1, Math.round(itemById(itemId).price * markup * balance.returnRate));
}

/** Whether the online store would take this item back: it has to be something the store sells. */
export function isReturnable(itemId: string): boolean {
  return !!storeById(ONLINE_STORE_ID)?.stock.some(([id]) => id === itemId);
}

export function returnProblem(state: GameState, itemId: string, qty: number): string | null {
  if (state.phase !== 'prep') return 'The shops have closed, so nothing can be returned.';
  if (!isReturnable(itemId)) return 'The store does not take this back. It is not something they sell.';
  if (!Number.isInteger(qty) || qty < 1) return 'Choose how many to return.';
  if ((state.storage[itemId] ?? 0) < qty) return `You only have ${state.storage[itemId] ?? 0} in storage.`;
  return null;
}

export type ReturnResult = { ok: true; refund: number } | { ok: false; reason: string };

/** Send unused items from storage back to the online store for a refund. */
export function returnItems(state: GameState, itemId: string, qty: number): ReturnResult {
  const problem = returnProblem(state, itemId, qty);
  if (problem) return { ok: false, reason: problem };
  const refund = returnValue(itemId) * qty;
  state.storage[itemId] -= qty;
  if (state.storage[itemId] <= 0) delete state.storage[itemId];
  state.money += refund;
  // The store puts them back on the shelf, up to what it can hold
  const shelf = (state.stores[ONLINE_STORE_ID] ??= {});
  shelf[itemId] = Math.min(stockCap(ONLINE_STORE_ID, itemId, state.worldSeconds), (shelf[itemId] ?? 0) + qty);
  addMessage(state, `Returned ${qty}× ${itemById(itemId).name} to SurvivalMart for $${refund.toLocaleString('en-US')}.`, 'order');
  return { ok: true, refund };
}