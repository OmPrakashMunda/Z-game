import { HOUR } from '../data/balance';
import {
  EAT_ORDER, FRESH_FOOD_ITEM, FUEL_ORDER, FUEL_PER_ITEM, MEALS_PER_BASKET, MEALS_PER_ITEM, STARTER_PACK, SURVIVAL,
  WATER_PER_ITEM,
} from '../data/survival';
import { daylight, hourOf } from './clock';
import { plotOf } from './land';
import { addMessage } from './messages';
import type { GameState } from './state';
import { runtimeOf, topologyOf, type Issue, type Network, type Runtime, type UNode } from './utilities';
import { conditionIssue, outputFactor } from './upkeep';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Wind comes and goes over a few days. Deterministic, so a loaded game sees the same weather. */
export function windAt(worldSeconds: number): number {
  const h = worldSeconds / HOUR;
  return clamp(0.55 + 0.3 * Math.sin(h / 7.3) + 0.15 * Math.sin(h / 2.9 + 1), 0.05, 1);
}

// ---------------------------------------------------------------- Taking things from storage

function useUp(state: GameState, item: string): boolean {
  const n = state.storage[item] ?? 0;
  if (n < 1) return false;
  if (n === 1) delete state.storage[item];
  else state.storage[item] = n - 1;
  return true;
}

/**
 * Take up to `amount` from a supply that is kept as whole items in storage but used in small amounts.
 * Opens one item at a time into a buffer.
 */
function draw(
  state: GameState, buffer: 'mealBuffer' | 'waterBuffer' | 'fuelBuffer', order: string[], perItem: Record<string, number>, amount: number,
): number {
  const s = state.survival;
  let got = 0;
  while (got < amount - 1e-9) {
    if (s[buffer] <= 1e-9) {
      const item = order.find((i) => (state.storage[i] ?? 0) > 0);
      if (!item || !useUp(state, item)) break;
      s[buffer] += perItem[item];
    }
    const take = Math.min(amount - got, s[buffer]);
    s[buffer] -= take;
    got += take;
  }
  return got;
}

const WATER_ORDER = Object.keys(WATER_PER_ITEM);

export function reserveMeals(state: GameState): number {
  let n = state.survival.mealBuffer;
  for (const item of EAT_ORDER) n += (state.storage[item] ?? 0) * MEALS_PER_ITEM[item];
  return n;
}

export function reserveBottledWater(state: GameState): number {
  let n = state.survival.waterBuffer;
  for (const item of WATER_ORDER) n += (state.storage[item] ?? 0) * WATER_PER_ITEM[item];
  return n;
}

export function reserveFuel(state: GameState): number {
  let n = state.survival.fuelBuffer;
  for (const item of FUEL_ORDER) n += (state.storage[item] ?? 0) * FUEL_PER_ITEM[item];
  return n;
}

export function tankWater(state: GameState): { stored: number; capacity: number } {
  const topo = topologyOf(state);
  let stored = 0;
  let capacity = 0;
  for (const n of topo.nodes.values()) {
    if (!n.water?.storeL) continue;
    capacity += n.water.storeL;
    stored += clamp(n.piece.level ?? 0, 0, n.water.storeL);
  }
  return { stored, capacity };
}

// ---------------------------------------------------------------- The step

function giveStarter(state: GameState): void {
  const s = state.survival;
  s.starterGiven = true;
  for (const [item, qty] of Object.entries(STARTER_PACK)) state.storage[item] = (state.storage[item] ?? 0) + qty;
  const days = Math.floor(
    Math.min(reserveMeals(state) / dailyMeals(), (reserveBottledWater(state) + 0) / dailyWater()),
  );
  addMessage(
    state,
    `You moved in with food and water for about ${days} days. Survival comes first: build a water source and a food source before anything else, or your family will starve once these run out.`,
    'info',
  );
}

export const dailyWater = () => SURVIVAL.people * SURVIVAL.waterPerPersonDay;
export const dailyMeals = () => SURVIVAL.people * SURVIVAL.mealsPerPersonDay;

/** Called every simulation step with the game time that just passed. */
export function stepSurvival(state: GameState, worldDt: number): void {
  const rt = runtimeOf(state);
  if (rt.disabled || !state.plotId || state.phase === 'dead') return;
  if (!state.survival.starterGiven) giveStarter(state);
  rt.pending += worldDt;
  if (rt.pending >= SURVIVAL.minTickSeconds) flushSurvival(state);
}

/** Simulate all the waiting game time now. */
export function flushSurvival(state: GameState): void {
  const rt = runtimeOf(state);
  if (rt.disabled || !state.plotId || state.phase === 'dead') {
    rt.pending = 0;
    return;
  }
  const total = rt.pending;
  rt.pending = 0;
  if (total <= 0) return;
  const start = state.worldSeconds - total;
  let done = 0;
  const dead = () => state.phase === 'dead'; // tick() can end the game, which the compiler cannot see
  while (done < total - 1e-6 && !dead()) {
    const dt = Math.min(SURVIVAL.chunkSeconds, total - done);
    tick(state, rt, start + done + dt / 2, dt);
    if (rt.cheats.godMode) {
      state.player.health = 100;
      state.player.hunger = 100;
      state.player.thirst = 100;
    }
    done += dt;
  }
  // Once the family is dead the last message should be why, so no more reminders
  if (!dead()) sendNotices(state);
}

interface WaterBook {
  net: Network;
  clean: number;
  raw: number;
  filterCap: number;
  tanks: UNode[];
}

function tick(state: GameState, rt: Runtime, tMid: number, dt: number): void {
  const dtH = dt / HOUR;
  const sun = daylight(rt.cheats.hourLock ?? hourOf(tMid));
  const dark = sun < 0.35;
  const wind = windAt(tMid);
  const topo = topologyOf(state);
  const issues = new Map<number, Issue[]>();
  const flag = (n: UNode, issue: Issue) => {
    const list = issues.get(n.piece.id);
    if (list) list.push(issue);
    else issues.set(n.piece.id, [issue]);
  };
  const hasFuel = reserveFuel(state) > 0.01;

  // ---------------------------------------------------------- Power
  rt.powerSat.clear();
  for (const net of topo.networks) {
    if (net.kind !== 'power') continue;
    let supplyKw = 0;
    let demandKw = 0;
    let hasMaker = false;
    let hasCharger = false;
    let generatorKw = 0;
    const batteries: UNode[] = [];
    const generators: UNode[] = [];
    const consumers: UNode[] = [];
    for (const n of net.nodes) {
      const p = n.power!;
      if (p.makeKw) {
        hasMaker = true;
        const worn = outputFactor(n.piece);
        if (p.source === 'sun') { supplyKw += p.makeKw * worn * sun; hasCharger = true; }
        else if (p.source === 'wind') { supplyKw += p.makeKw * worn * wind; hasCharger = true; }
        else { generatorKw += p.makeKw * worn; generators.push(n); }
      }
      if (p.storeKwh) batteries.push(n);
      if (p.useKw) {
        consumers.push(n);
        if (n.wanted && !(p.darkOnly && !dark)) demandKw += p.useKw;
      }
    }

    const supply = supplyKw * dtH;
    const need = demandKw * dtH;
    let unmet = 0;
    if (supply >= need) {
      let surplus = supply - need;
      for (const b of batteries) {
        const cap = b.power!.storeKwh!;
        const level = clamp(b.piece.level ?? 0, 0, cap);
        const add = Math.min(surplus, cap - level);
        b.piece.level = level + add;
        surplus -= add;
      }
    } else {
      let deficit = need - supply;
      for (const b of batteries) {
        const level = clamp(b.piece.level ?? 0, 0, b.power!.storeKwh!);
        const take = Math.min(deficit, level);
        b.piece.level = level - take;
        deficit -= take;
      }
      if (deficit > 1e-9 && generatorKw > 0) {
        const want = Math.min(deficit, generatorKw * dtH);
        const fuel = draw(state, 'fuelBuffer', FUEL_ORDER, FUEL_PER_ITEM, want * SURVIVAL.fuelLitersPerKwh);
        deficit -= fuel / SURVIVAL.fuelLitersPerKwh;
      }
      unmet = Math.max(0, deficit);
    }
    const sat = need > 1e-12 ? clamp(1 - unmet / need, 0, 1) : 1;
    rt.powerSat.set(net.id, sat);

    // Problems
    for (const n of consumers) {
      const p = n.power!;
      if (!hasMaker) {
        flag(n, {
          kind: 'power', code: 'no_link',
          text: 'Not connected to a power source. Place it within 5 m of a generator, solar panel or battery, or put a power pole within 14 m.',
        });
        continue;
      }
      const active = n.wanted && !(p.darkOnly && !dark);
      if (active && sat < 0.9) {
        if (generators.length > 0 && !hasFuel && !hasCharger) {
          flag(n, { kind: 'fuel', code: 'no_fuel', text: 'No power: the generator has no fuel. Buy gasoline or diesel.' });
        } else {
          flag(n, {
            kind: 'power', code: 'low_power',
            text: 'Not enough power right now. Add batteries for the night, more panels, or a generator.',
          });
        }
      }
    }
    for (const g of generators) {
      if (!hasFuel) flag(g, { kind: 'fuel', code: 'no_fuel', text: 'Out of fuel. Buy gasoline or diesel; it burns only when something needs power.' });
    }
    for (const b of batteries) {
      if (!hasCharger) {
        flag(b, { kind: 'power', code: 'no_charge', text: 'Nothing charges this battery. Link it to a solar panel or wind turbine.' });
      }
    }
  }
  const satOf = (n: UNode): number => {
    const net = topo.powerOf.get(n.piece.id);
    return net ? rt.powerSat.get(net.id) ?? 0 : 0;
  };

  // ---------------------------------------------------------- Water: what each network makes
  const books = new Map<number, WaterBook>();
  for (const net of topo.networks) {
    if (net.kind !== 'water') continue;
    const book: WaterBook = { net, clean: 0, raw: 0, filterCap: 0, tanks: [] };
    let hasFilter = false;
    let hasMaker = false;
    for (const n of net.nodes) {
      const w = n.water!;
      if (w.storeL) book.tanks.push(n);
      if (w.filterLph) {
        hasFilter = true;
        if (n.wanted && n.power) book.filterCap += w.filterLph * dtH * satOf(n);
      }
      if (w.makeLph) {
        hasMaker = true;
        let f = 1;
        if (w.source === 'wind') f = wind;
        if (n.power?.useKw) f *= satOf(n);
        const liters = w.makeLph * dtH * f * outputFactor(n.piece);
        if (w.raw) book.raw += liters;
        else book.clean += liters;
      }
    }
    books.set(net.id, book);
    for (const n of net.nodes) {
      const w = n.water!;
      // Ponds are scenery until someone tries to store their water, so only warn when there is a tank to fill
      if (w.raw && w.makeLph && !hasFilter && book.tanks.length > 0) {
        flag(n, {
          kind: 'water', code: 'needs_filter',
          text: 'Raw water. It can water crops, but needs a powered water filter within range before it is safe to drink.',
        });
      }
      if (w.storeL && !hasMaker) {
        flag(n, { kind: 'water', code: 'tank_unfilled', text: 'Nothing fills this tank. Link a well, windmill or collector to it, with a pipe junction if it is far away.' });
      }
    }
  }
  const bookOf = (n: UNode) => {
    const net = topo.waterOf.get(n.piece.id);
    return net ? books.get(net.id) : undefined;
  };

  /** Draw water for crops: raw water first (it is no use for drinking anyway), then clean flow, then the tanks. */
  const drawForCrops = (book: WaterBook, want: number): number => {
    let got = 0;
    const take = (have: number) => Math.min(want - got, have);
    let t = take(book.raw); book.raw -= t; got += t;
    t = take(book.clean); book.clean -= t; got += t;
    for (const tank of book.tanks) {
      if (got >= want - 1e-9) break;
      const level = clamp(tank.piece.level ?? 0, 0, tank.water!.storeL!);
      t = take(level);
      tank.piece.level = level - t;
      got += t;
    }
    return got;
  };

  // ---------------------------------------------------------- Farms
  let harvested = 0;
  for (const n of topo.nodes.values()) {
    const f = n.farm;
    if (!f) continue;
    const p = n.piece;
    let growth = p.growth ?? 0;

    // Is there water within reach? A structural problem, so it is reported before anything else.
    const book = f.waterPerDay > 0 ? bookOf(n) : undefined;
    const linked = f.waterPerDay <= 0 || (!!book && book.net.nodes.some((m) => m !== n && (m.water!.makeLph || m.water!.storeL)));
    if (!linked) {
      flag(n, {
        kind: 'water', code: 'no_link',
        text: 'Not connected to water. Place it within 6 m of a tank or well, or put a pipe junction within 14 m.',
      });
    }

    // A new cycle needs seeds or feed. They are only used up once the farm can actually grow.
    const needs = [f.seeds, f.feed].filter((x): x is NonNullable<typeof x> => !!x);
    let missing = false;
    if (growth <= 0) {
      const lacking = needs.find((x) => (state.storage[x.item] ?? 0) < x.qty);
      if (lacking) {
        missing = true;
        flag(n, lacking === f.seeds
          ? { kind: 'seeds', code: 'no_seeds', text: 'Needs vegetable seeds to start growing. Buy some from the online store (Farming).' }
          : { kind: 'feed', code: 'no_feed', text: 'Needs animal feed. Buy some from the online store (Farming).' });
      }
    }
    if (!linked || missing) {
      p.growth = growth;
      continue;
    }
    if (growth <= 0) {
      for (const x of needs) for (let i = 0; i < x.qty; i++) useUp(state, x.item);
      growth = 1e-6;
    }

    let factor = 1;
    if (book) {
      const want = (f.waterPerDay * dtH) / 24;
      factor = want > 0 ? drawForCrops(book, want) / want : 1;
      if (factor < 0.5) {
        flag(n, { kind: 'water', code: 'dry', text: 'The water supply has run dry. Add a bigger source or a tank so the crops can grow.' });
      }
    }
    growth += (factor * outputFactor(p) * dtH) / (f.days * 24);
    if (growth >= 1) {
      state.storage[FRESH_FOOD_ITEM] = (state.storage[FRESH_FOOD_ITEM] ?? 0) + f.meals / MEALS_PER_BASKET;
      harvested += f.meals;
      growth = 0;
    }
    p.growth = growth;
  }
  state.survival.harvestMeals += harvested;

  // ---------------------------------------------------------- Water: filter, store the rest
  let surplus = 0;
  for (const book of books.values()) {
    book.clean += Math.min(book.raw, book.filterCap);
    // Share the water out evenly between tanks that still have room, so no tank stays empty while another fills
    let open = book.tanks.filter((t) => clamp(t.piece.level ?? 0, 0, t.water!.storeL!) < t.water!.storeL! - 1e-9);
    while (book.clean > 1e-9 && open.length > 0) {
      const share = book.clean / open.length;
      for (const tank of open) {
        const cap = tank.water!.storeL!;
        const level = clamp(tank.piece.level ?? 0, 0, cap);
        const add = Math.min(share, cap - level);
        tank.piece.level = level + add;
        book.clean -= add;
      }
      open = open.filter((t) => clamp(t.piece.level ?? 0, 0, t.water!.storeL!) < t.water!.storeL! - 1e-9);
    }
    surplus += book.clean;
  }

  // ---------------------------------------------------------- The family
  const pl = state.player;
  const wantWater = (dailyWater() * dtH) / 24;
  let water = 0;
  const plot = plotOf(state);
  if (plot?.water === 'well') water += Math.min(wantWater, SURVIVAL.oldWellLph * dtH);
  water += Math.min(wantWater - water, surplus);
  for (const n of topo.nodes.values()) {
    if (water >= wantWater - 1e-9) break;
    if (!n.water?.storeL) continue;
    const level = clamp(n.piece.level ?? 0, 0, n.water.storeL);
    const take = Math.min(wantWater - water, level);
    n.piece.level = level - take;
    water += take;
  }
  water += draw(state, 'waterBuffer', WATER_ORDER, WATER_PER_ITEM, wantWater - water);

  const wantMeals = (dailyMeals() * dtH) / 24;
  const meals = draw(state, 'mealBuffer', EAT_ORDER, MEALS_PER_ITEM, wantMeals);

  const drained = (share: number, perHour: number, now: number): number =>
    share >= 0.999 ? Math.min(100, now + SURVIVAL.recoverPerHour * dtH) : Math.max(0, now - (1 - share) * perHour * dtH);
  pl.thirst = drained(wantWater > 0 ? water / wantWater : 1, 100 / SURVIVAL.hoursToDehydrate, pl.thirst);
  pl.hunger = drained(wantMeals > 0 ? meals / wantMeals : 1, 100 / SURVIVAL.hoursToStarve, pl.hunger);

  let health = 0;
  if (pl.thirst <= 0) health -= SURVIVAL.healthLossThirst;
  if (pl.hunger <= 0) health -= SURVIVAL.healthLossHunger;
  if (health === 0 && pl.thirst > 40 && pl.hunger > 40) health = SURVIVAL.healthRegen;
  pl.health = clamp(pl.health + health * dtH, 0, 100);

  rt.issues = issues;
  rt.surplusFlow = surplus;

  if (pl.health <= 0) {
    state.phase = 'dead';
    addMessage(
      state,
      pl.thirst <= 0
        ? 'Your family died of thirst. Water is the first thing to secure: a well, a tank and a way to carry water to the base.'
        : 'Your family starved. Food is the first thing to secure: grow it, store it, and keep the pantry full.',
      'warning',
    );
  }
}

// ---------------------------------------------------------------- Notifications

/** How often, in game hours, the same alert may be repeated. */
const NOTICE_EVERY_HOURS = 14;

function notice(state: GameState, key: string, text: string, kind: 'warning' | 'info' = 'warning'): void {
  const last = state.survival.notices[key];
  if (last !== undefined && state.worldSeconds - last < NOTICE_EVERY_HOURS * HOUR) return;
  state.survival.notices[key] = state.worldSeconds;
  addMessage(state, text, kind);
}

function sendNotices(state: GameState): void {
  const s = summarize(state);
  const day = Math.floor(state.worldSeconds / (24 * HOUR)) + 1;

  if (state.survival.harvestMeals > 0 && day !== state.survival.harvestReportDay) {
    addMessage(state, `Harvest: your farms produced ${Math.round(state.survival.harvestMeals)} meals of fresh food.`, 'info');
    state.survival.harvestMeals = 0;
    state.survival.harvestReportDay = day;
  }

  if (!s.water.sustained && !s.food.sustained && s.counts.waterSources === 0 && s.counts.farms === 0) {
    notice(
      state, 'survival_first',
      `Build food and water sources first. Your supplies last about ${Math.max(0, Math.floor(Math.min(s.water.days, s.food.days)))} more days, and nothing else matters if your family cannot eat or drink.`,
    );
  } else if (!s.water.sustained && s.counts.waterSources === 0) {
    notice(state, 'need_water', 'You have no water source. Build a well first, then a tank to store the water.');
  } else if (!s.food.sustained && s.counts.farms === 0) {
    notice(state, 'need_food', 'You have no way to grow food yet. Build a garden or greenhouse near your water.');
  }

  if (s.water.days < SURVIVAL.lowSupplyDays && !s.water.sustained) {
    notice(state, 'water_low', `Water is running low: about ${s.water.days.toFixed(1)} days left. Get a source working or buy bottled water.`);
  }
  if (s.food.days < SURVIVAL.lowSupplyDays && !s.food.sustained) {
    notice(state, 'food_low', `Food is running low: about ${s.food.days.toFixed(1)} days left. Harvest, or buy more from the online store.`);
  }
  if (state.player.thirst < 30) notice(state, 'thirsty', 'Your family is badly dehydrated. Water, now.');
  if (state.player.hunger < 30) notice(state, 'hungry', 'Your family is starving. They need food, now.');
}

// ---------------------------------------------------------------- A summary for the screen and the advisor

export interface Summary {
  hasBase: boolean;
  people: number;
  water: {
    /** Liters in tanks, and the most the tanks can hold. */
    stored: number;
    capacity: number;
    /** Everything the family could drink from supplies. */
    reserve: number;
    perDay: number;
    /** Days the reserve lasts. Infinity when sources make enough. */
    days: number;
    /** Liters a day the working sources can make. */
    makePerDay: number;
    sustained: boolean;
  };
  food: { reserve: number; perDay: number; days: number; makePerDay: number; sustained: boolean };
  power: { makeKw: number; useKw: number; storedKwh: number; capacityKwh: number; hasSource: boolean };
  counts: {
    waterSources: number;
    cleanWaterSources: number;
    tanks: number;
    farms: number;
    workingFarms: number;
    powerSources: number;
    powerConsumers: number;
    shelters: number;
    barriers: number;
  };
  /** Structures with something wrong, with the first problem of each. */
  problems: Array<{ pieceId: number; issue: Issue }>;
}

const SHELTERS = new Set(['tent_large', 'prefab_home', 'cabin_small', 'house_family', 'house_large', 'bunker']);

export function summarize(state: GameState): Summary {
  const rt = runtimeOf(state);
  const topo = topologyOf(state);
  const wind = windAt(state.worldSeconds);
  const sun = daylight(rt.cheats.hourLock ?? hourOf(state.worldSeconds));
  const demandWater = dailyWater();
  const demandMeals = dailyMeals();
  const blocking = (id: number) => (rt.issues.get(id) ?? []).some((i) => ['no_link', 'dry', 'no_seeds', 'no_feed'].includes(i.code));

  let waterMake = state.plotId && plotOf(state)?.water === 'well' ? SURVIVAL.oldWellLph * 24 : 0;
  let foodMake = 0;
  let waterSources = 0;
  let cleanSources = 0;
  let tanks = 0;
  let farms = 0;
  let workingFarms = 0;
  let powerSources = 0;
  let powerConsumers = 0;
  let makeKw = 0;
  let useKw = 0;
  let storedKwh = 0;
  let capacityKwh = 0;
  let shelters = 0;
  let barriers = 0;

  for (const n of topo.nodes.values()) {
    const w = n.water;
    if (w?.makeLph) {
      waterSources++;
      const net = topo.waterOf.get(n.piece.id);
      const filtered = !!net?.nodes.some((m) => m.water?.filterLph && m.power && (rt.powerSat.get(topo.powerOf.get(m.piece.id)?.id ?? -1) ?? 0) >= 0.5);
      let f = w.source === 'wind' ? 0.55 : 1;
      if (n.power?.useKw) f *= (rt.powerSat.get(topo.powerOf.get(n.piece.id)?.id ?? -1) ?? 0) >= 0.5 ? 1 : 0;
      if (!w.raw || filtered) {
        cleanSources++;
        waterMake += w.makeLph * 24 * f * outputFactor(n.piece);
      }
    }
    if (w?.storeL) tanks++;
    if (n.farm) {
      farms++;
      if (!blocking(n.piece.id)) {
        workingFarms++;
        foodMake += (n.farm.meals / n.farm.days) * outputFactor(n.piece);
      }
    }
    const p = n.power;
    if (p?.makeKw) {
      powerSources++;
      if (p.source === 'sun') makeKw += p.makeKw * outputFactor(n.piece) * sun;
      else if (p.source === 'wind') makeKw += p.makeKw * outputFactor(n.piece) * wind;
    }
    if (p?.useKw) {
      powerConsumers++;
      if (n.wanted && !(p.darkOnly && sun >= 0.35)) useKw += p.useKw;
    }
    if (p?.storeKwh) {
      capacityKwh += p.storeKwh;
      storedKwh += clamp(n.piece.level ?? 0, 0, p.storeKwh);
    }
  }
  for (const piece of state.pieces) {
    if (piece.progress < 1) continue;
    if (SHELTERS.has(piece.type)) shelters++;
    if (piece.type.startsWith('fence_') || piece.type.startsWith('wall_') || piece.type.startsWith('container_') || piece.type.startsWith('gate_') || piece.type === 'sandbag_wall') barriers++;
  }

  const tank = tankWater(state);
  const waterReserve = tank.stored + reserveBottledWater(state);
  const mealReserve = reserveMeals(state);
  const waterSustained = waterMake >= demandWater;
  const foodSustained = foodMake >= demandMeals;

  const problems: Summary['problems'] = [];
  for (const piece of state.pieces) {
    const list = rt.issues.get(piece.id);
    if (list && list.length > 0) {
      problems.push({ pieceId: piece.id, issue: list[0] });
      continue;
    }
    // Wear and dirt: nothing is wrong with the connections, but it needs looking after
    const care = conditionIssue(piece);
    if (care) problems.push({ pieceId: piece.id, issue: care });
  }

  return {
    hasBase: state.plotId !== null,
    people: SURVIVAL.people,
    water: {
      stored: tank.stored,
      capacity: tank.capacity,
      reserve: waterReserve,
      perDay: demandWater,
      days: waterSustained ? Infinity : waterReserve / Math.max(0.001, demandWater - waterMake),
      makePerDay: waterMake,
      sustained: waterSustained,
    },
    food: {
      reserve: mealReserve,
      perDay: demandMeals,
      days: foodSustained ? Infinity : mealReserve / Math.max(0.001, demandMeals - foodMake),
      makePerDay: foodMake,
      sustained: foodSustained,
    },
    power: { makeKw, useKw, storedKwh, capacityKwh, hasSource: powerSources > 0 },
    counts: { waterSources, cleanWaterSources: cleanSources, tanks, farms, workingFarms, powerSources, powerConsumers, shelters, barriers },
    problems,
  };
}
