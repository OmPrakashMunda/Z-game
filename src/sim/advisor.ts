import { balance } from '../data/balance';
import type { Category } from '../data/items';
import { ONLINE_STORE_ID } from '../data/stores';
import { isStructure, STRUCTURES } from '../data/structures';
import { SURVIVAL } from '../data/survival';
import { isStoreOpen, itemPrice } from './economy';
import type { GameState } from './state';
import { summarize, type Summary } from './survival';

/**
 * The in-game advisor. It reads the state and says what to do next, in order of how fast the family would die without it.
 * It never changes the game; the screen turns each action into a click.
 */

export type AdviceAction =
  | { kind: 'buy'; label: string; item: string; qty: number; price: number }
  | { kind: 'place'; label: string; item: string }
  | { kind: 'store'; label: string; category: Category }
  | { kind: 'show'; label: string; pieceId: number };

export interface AdviceStep {
  id: string;
  icon: string;
  title: string;
  detail: string;
  state: 'done' | 'current' | 'todo';
  actions: AdviceAction[];
}

export interface AdviceAlert {
  id: string;
  severity: 'bad' | 'warn';
  text: string;
  action?: AdviceAction;
}

export interface Advice {
  alerts: AdviceAlert[];
  steps: AdviceStep[];
  /** The step to work on now, if any. */
  current: AdviceStep | null;
  summary: Summary;
}

const WALL_GOAL = 20;
const PANTRY_DAYS = 7;

const days = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} days` : 'plenty');

export function advise(state: GameState): Advice {
  const s = summarize(state);
  const open = isStoreOpen(state, ONLINE_STORE_ID);
  const stock = (item: string) => state.storage[item] ?? 0;

  /** Buy it if the player has none, place it if they already own one. */
  const acquire = (item: string, qty = 1): AdviceAction[] => {
    const def = STRUCTURES[item];
    if (isStructure(item) && stock(item) >= qty) return [{ kind: 'place', label: `Place ${def.name.toLowerCase()}`, item }];
    if (!open) return [];
    const name = def ? def.name : item.replace(/_/g, ' ');
    const price = itemPrice(ONLINE_STORE_ID, item, state.worldSeconds) * qty;
    return [{ kind: 'buy', label: `Buy ${qty > 1 ? `${qty} x ` : ''}${name.toLowerCase()}`, item, qty, price }];
  };
  const browse = (category: Category, label: string): AdviceAction[] => (open ? [{ kind: 'store', label, category }] : []);

  const steps: AdviceStep[] = [];
  const add = (step: Omit<AdviceStep, 'state'> & { done: boolean }) => {
    const { done, ...rest } = step;
    steps.push({ ...rest, state: done ? 'done' : 'todo' });
  };

  if (!state.plotId) {
    add({
      id: 'plot', icon: 'MapPin', done: false, title: 'Buy a base plot',
      detail: 'Go to Hillside Realty and buy land. Your family moves in right away, so choose somewhere with water and room to grow.',
      actions: [],
    });
    return finish(state, steps, [], s);
  }

  const firstProblem = (pred: (code: string, pieceId: number) => boolean) => s.problems.find((p) => pred(p.issue.code, p.pieceId));

  // 1. Water
  add({
    id: 'water', icon: 'Droplet', done: s.counts.cleanWaterSources > 0,
    title: 'Get a water source',
    detail: s.counts.cleanWaterSources > 0
      ? `Your wells and collectors make about ${Math.round(s.water.makePerDay)} L a day. The family drinks ${s.water.perDay} L.`
      : `Your family drinks ${s.water.perDay} L a day. Your bottled water lasts about ${days(s.water.days)}. A hand-pump well needs no power.`,
    actions: s.counts.cleanWaterSources > 0 ? [] : [...acquire('well_hand'), ...browse('waterworks', 'Browse water')],
  });

  // 2. Water storage, joined to the source
  const unfilled = firstProblem((c) => c === 'tank_unfilled');
  add({
    id: 'tank', icon: 'Cylinder', done: s.counts.tanks > 0 && !unfilled,
    title: 'Store water in a tank',
    detail: unfilled
      ? unfilled.issue.text
      : s.counts.tanks > 0
        ? `Your tanks hold ${Math.round(s.water.stored)} of ${s.water.capacity} L. Crops and the family draw from them.`
        : 'A tank keeps water for the nights, dry spells and your farms. Put it within 6 m of the well, or join them with a pipe junction.',
    actions: unfilled
      ? [...acquire('pipe_post'), { kind: 'show', label: 'Show the tank', pieceId: unfilled.pieceId }]
      : s.counts.tanks > 0 ? [] : acquire('water_tank'),
  });

  // 3. Food
  const farmProblem = firstProblem((c, id) => ['no_link', 'dry', 'no_seeds', 'no_feed'].includes(c) && isFarmType(state, id));
  const farmActions = (): AdviceAction[] => {
    if (s.counts.farms === 0) return [...acquire('garden_bed'), ...acquire('seeds_veg', 2)];
    if (!farmProblem) return [];
    const code = farmProblem.issue.code;
    const show: AdviceAction = { kind: 'show', label: 'Show the farm', pieceId: farmProblem.pieceId };
    if (code === 'no_seeds') return [...acquire('seeds_veg', 2), show];
    if (code === 'no_feed') return [...acquire('animal_feed', 1), show];
    if (code === 'no_link') return [...acquire('pipe_post'), show];
    return [...acquire('water_tank'), show];
  };
  add({
    id: 'food', icon: 'Sprout', done: s.counts.workingFarms > 0,
    title: 'Grow food',
    detail: s.counts.workingFarms > 0
      ? `Your farms make about ${Math.round(s.food.makePerDay)} meals a day. The family eats ${s.food.perDay}.`
      : s.counts.farms > 0 && farmProblem
        ? farmProblem.issue.text
        : `Your family eats ${s.food.perDay} meals a day and your pantry lasts about ${days(s.food.days)}. A raised garden bed is cheap; it needs seeds and a water connection.`,
    actions: s.counts.workingFarms > 0 ? [] : farmActions(),
  });

  // 4. A week of supplies in reserve
  const pantryOk = (s.water.sustained || s.water.days >= PANTRY_DAYS) && (s.food.sustained || s.food.days >= PANTRY_DAYS);
  add({
    id: 'pantry', icon: 'Package', done: pantryOk,
    title: 'Keep a week of supplies in reserve',
    detail: pantryOk
      ? 'Your reserves are comfortable.'
      : `You have about ${days(s.food.days)} of food and ${days(s.water.days)} of water. Stock up so a bad harvest or a broken pump is not fatal.`,
    actions: pantryOk ? [] : [
      ...(s.food.days < PANTRY_DAYS ? browse('food', 'Browse food') : []),
      ...(s.water.days < PANTRY_DAYS ? acquire('bottled_water', 4) : []),
    ],
  });

  // 5. Power
  add({
    id: 'power', icon: 'Zap', done: s.counts.powerSources > 0,
    title: 'Set up power',
    detail: s.counts.powerSources > 0
      ? `Making ${s.power.makeKw.toFixed(1)} kW now, using ${s.power.useKw.toFixed(1)} kW. Batteries hold ${s.power.storedKwh.toFixed(1)} of ${s.power.capacityKwh} kWh.`
      : 'Lamps, deep wells, water filters and electric fences need power. Solar panels work by day, so add a battery for the night.',
    actions: s.counts.powerSources > 0 ? [] : [...acquire('solar_panel', 2), ...acquire('battery_bank')],
  });

  // 6. A roof
  add({
    id: 'shelter', icon: 'House', done: s.counts.shelters > 0,
    title: 'Give the family a roof',
    detail: s.counts.shelters > 0 ? 'Your family has a shelter.' : 'Tents go up in minutes. A cabin or house is safer once the outbreak starts.',
    actions: s.counts.shelters > 0 ? [] : [...acquire('tent_large'), ...acquire('cabin_small')],
  });

  // 7. Walls
  add({
    id: 'walls', icon: 'Fence', done: s.counts.barriers >= WALL_GOAL,
    title: 'Wall in the base',
    detail: `${s.counts.barriers} of ${WALL_GOAL} wall pieces built. Containers and concrete are the strongest. Walls matter most after day ${balance.outbreakDay}.`,
    actions: s.counts.barriers >= WALL_GOAL ? [] : browse('fences', 'Browse fences and walls'),
  });

  // Alerts: what could kill the family soonest, then what is broken
  const alerts: AdviceAlert[] = [];
  const pl = state.player;
  if (pl.thirst < 30) {
    alerts.push({ id: 'thirst', severity: 'bad', text: 'Your family is dehydrated. They need water now.', action: acquire('bottled_water', 4)[0] });
  } else if (!s.water.sustained && s.water.days < SURVIVAL.lowSupplyDays) {
    alerts.push({ id: 'water_low', severity: 'bad', text: `Water for only ${days(s.water.days)}. Get a source working or buy bottled water.`, action: acquire('bottled_water', 4)[0] });
  }
  if (pl.hunger < 30) {
    alerts.push({ id: 'hunger', severity: 'bad', text: 'Your family is starving. They need food now.', action: acquire('canned_food', 3)[0] });
  } else if (!s.food.sustained && s.food.days < SURVIVAL.lowSupplyDays) {
    alerts.push({ id: 'food_low', severity: 'bad', text: `Food for only ${days(s.food.days)}. Harvest, or buy more.`, action: acquire('canned_food', 3)[0] });
  }
  for (const p of s.problems.slice(0, 3)) {
    const piece = state.pieces.find((x) => x.id === p.pieceId);
    const name = piece ? STRUCTURES[piece.type]?.name ?? 'Structure' : 'Structure';
    alerts.push({
      id: `piece_${p.pieceId}`, severity: 'warn', text: `${name}: ${p.issue.text}`,
      action: { kind: 'show', label: 'Show', pieceId: p.pieceId },
    });
  }
  if (s.problems.length > 3) {
    alerts.push({ id: 'more', severity: 'warn', text: `${s.problems.length - 3} more structures need attention. Look for the warning signs above them.` });
  }

  return finish(state, steps, alerts, s);
}

function isFarmType(state: GameState, pieceId: number): boolean {
  const piece = state.pieces.find((x) => x.id === pieceId);
  return !!piece && ['garden_bed', 'greenhouse_kit', 'greenhouse_large', 'orchard_plot', 'chicken_coop'].includes(piece.type);
}

function finish(state: GameState, steps: AdviceStep[], alerts: AdviceAlert[], summary: Summary): Advice {
  let current: AdviceStep | null = null;
  for (const step of steps) {
    if (step.state === 'done') continue;
    if (!current) {
      step.state = 'current';
      current = step;
    }
  }
  // After the outbreak starts the shops are closed, so only describe what is missing
  if (state.phase !== 'prep') {
    for (const step of steps) step.actions = step.actions.filter((a) => a.kind === 'show' || a.kind === 'place');
  }
  return { alerts, steps, current, summary };
}
