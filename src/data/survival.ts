/**
 * The rules of survival as data: what the family needs, and what each structure makes, stores or uses.
 * Nothing here runs. sim/survival.ts and sim/utilities.ts read these tables.
 *
 * Units: power in kW and kWh, water in liters, food in meals (one meal feeds one person once).
 */

export const SURVIVAL = {
  /** People living at the base. They share one set of needs. */
  people: 4,
  waterPerPersonDay: 3,
  mealsPerPersonDay: 3,
  /** Hours from full to empty with nothing to drink or eat. */
  hoursToDehydrate: 36,
  hoursToStarve: 72,
  /** How fast a meter refills per hour once the need is met. */
  recoverPerHour: 10,
  /** Health lost per hour at an empty meter, and gained per hour when both meters are healthy. */
  healthLossThirst: 5,
  healthLossHunger: 1.5,
  healthRegen: 0.8,
  /** Drinking water per hour from the old well that comes with some plots. */
  oldWellLph: 3,
  /** Below this many days of supplies the game warns the player. */
  lowSupplyDays: 2.5,
  /** Fuel burned per kWh made by a generator. */
  fuelLitersPerKwh: 0.35,
  /** Slice sizes for the simulation, in game seconds. Long jumps are cut into slices so day and night still count. */
  chunkSeconds: 1800,
  minTickSeconds: 30,
} as const;

/** Handed over when the player moves in, so there is time to build proper supplies. */
export const STARTER_PACK: Record<string, number> = { canned_food: 3, bottled_water: 2 };

/** Meals in one unit of each food item. The family eats the first ones in the list first. */
export const MEALS_PER_ITEM: Record<string, number> = {
  fresh_food: 6,
  pasta: 20,
  peanut_butter: 24,
  protein_bars: 24,
  canned_veg: 24,
  canned_food: 24,
  dry_beans: 50,
  rice: 100,
};
export const EAT_ORDER = ['fresh_food', 'pasta', 'peanut_butter', 'protein_bars', 'canned_veg', 'canned_food', 'dry_beans', 'rice'];

export const WATER_PER_ITEM: Record<string, number> = { bottled_water: 36 };
export const FUEL_PER_ITEM: Record<string, number> = { gasoline: 20, diesel: 20 };
export const FUEL_ORDER = ['gasoline', 'diesel'];

/** What a harvest is stored as: one basket holds this many meals. */
export const FRESH_FOOD_ITEM = 'fresh_food';
export const MEALS_PER_BASKET = MEALS_PER_ITEM[FRESH_FOOD_ITEM];

export type IssueKind = 'power' | 'water' | 'fuel' | 'seeds' | 'feed' | 'repair' | 'clean';

export interface PowerSpec {
  /** kW produced at full output. */
  makeKw?: number;
  source?: 'sun' | 'wind' | 'fuel';
  /** kW drawn while running. */
  useKw?: number;
  /** Only draws power in the dark (lights). */
  darkOnly?: boolean;
  /** kWh of battery capacity. */
  storeKwh?: number;
  /** How far, in meters, this reaches to join a network. */
  reach: number;
  /** Conductors join other pieces to the network. Plain machines only plug in to a conductor. */
  conductor: boolean;
}

export interface WaterSpec {
  /** Liters per hour at full flow. */
  makeLph?: number;
  source?: 'ground' | 'wind' | 'rain' | 'pond';
  /** Not safe to drink until a powered filter in the same network cleans it. */
  raw?: boolean;
  storeL?: number;
  /** Liters per hour this can clean. */
  filterLph?: number;
  reach: number;
  conductor: boolean;
}

export interface FarmSpec {
  /** Game days for one growing cycle. */
  days: number;
  meals: number;
  /** Liters per day while growing. Zero means it needs no water. */
  waterPerDay: number;
  /** Item used up at the start of each cycle. */
  seeds?: { item: string; qty: number };
  feed?: { item: string; qty: number };
}

export interface Utility {
  power?: PowerSpec;
  water?: WaterSpec;
  farm?: FarmSpec;
}

const CONSUMER_REACH = 3;
const SOURCE_REACH = 6;

const producer = (makeKw: number, source: 'sun' | 'wind' | 'fuel'): PowerSpec => ({ makeKw, source, reach: 5, conductor: true });
const light = (useKw: number): PowerSpec => ({ useKw, darkOnly: true, reach: CONSUMER_REACH, conductor: false });
const machine = (useKw: number): PowerSpec => ({ useKw, reach: CONSUMER_REACH, conductor: false });
const wet = (reach = CONSUMER_REACH): WaterSpec => ({ reach, conductor: false });
const pond = (makeLph: number): WaterSpec => ({ makeLph, source: 'pond', raw: true, reach: SOURCE_REACH, conductor: true });

export const UTILITIES: Record<string, Utility> = {
  // ---- Power sources and links
  solar_panel: { power: producer(0.35, 'sun') },
  solar_array: { power: producer(2.1, 'sun') },
  wind_turbine: { power: producer(1.2, 'wind') },
  generator_5kw: { power: producer(5, 'fuel') },
  generator_10kw: { power: producer(10, 'fuel') },
  battery_bank: { power: { storeKwh: 12, reach: 5, conductor: true } },
  power_pole: { power: { reach: 14, conductor: true } },

  // ---- Things that run on power
  lamp_post: { power: light(0.08) },
  floodlight_tower: { power: light(0.4) },
  fence_electric: { power: machine(0.15) },
  radio_mast: { power: machine(0.3) },
  medical_station: { power: machine(0.2) },
  water_filter: { power: machine(0.3), water: { filterLph: 40, reach: SOURCE_REACH, conductor: true } },
  well_deep: { power: machine(0.6), water: { makeLph: 60, source: 'ground', reach: SOURCE_REACH, conductor: true } },

  // ---- Water sources, storage and links
  well_hand: { water: { makeLph: 12, source: 'ground', reach: SOURCE_REACH, conductor: true } },
  windmill: { water: { makeLph: 20, source: 'wind', reach: SOURCE_REACH, conductor: true } },
  rain_collector: { water: { makeLph: 4, source: 'rain', raw: true, reach: SOURCE_REACH, conductor: true } },
  pond_small: { water: pond(10) },
  pond_large: { water: pond(25) },
  pond_fish: { water: pond(15), farm: { days: 4, meals: 24, waterPerDay: 0 } },
  water_tank: { water: { storeL: 1000, reach: SOURCE_REACH, conductor: true } },
  water_tower: { water: { storeL: 5000, reach: 8, conductor: true } },
  pipe_post: { water: { reach: 14, conductor: true } },

  // ---- Farms
  garden_bed: { water: wet(), farm: { days: 5, meals: 18, waterPerDay: 20, seeds: { item: 'seeds_veg', qty: 1 } } },
  greenhouse_kit: { water: wet(), farm: { days: 5, meals: 42, waterPerDay: 40, seeds: { item: 'seeds_veg', qty: 2 } } },
  greenhouse_large: { water: wet(6), farm: { days: 5, meals: 84, waterPerDay: 70, seeds: { item: 'seeds_veg', qty: 3 } } },
  orchard_plot: { water: wet(), farm: { days: 10, meals: 72, waterPerDay: 30 } },
  chicken_coop: { water: wet(), farm: { days: 4, meals: 18, waterPerDay: 8, feed: { item: 'animal_feed', qty: 1 } } },
  tree_apple: { farm: { days: 8, meals: 6, waterPerDay: 0 } },
  beehive: { farm: { days: 7, meals: 6, waterPerDay: 0 } },
};

export function utilityOf(type: string): Utility | undefined {
  return UTILITIES[type];
}

/** Whether a structure takes part in survival at all (for the advisor and the store hints). */
export const FOOD_STRUCTURES = Object.keys(UTILITIES).filter((id) => UTILITIES[id].farm);
export const WATER_SOURCE_STRUCTURES = Object.keys(UTILITIES).filter((id) => UTILITIES[id].water?.makeLph);
export const POWER_SOURCE_STRUCTURES = Object.keys(UTILITIES).filter((id) => UTILITIES[id].power?.makeKw);
