import { locationById, type LocationId } from './city';
import { ITEMS } from './items';
import { STRUCTURE_LIST } from './structures';

/** A place that sells things: a shop in town, or the online store. */
export type StoreId = LocationId | 'online';

export const ONLINE_STORE_ID = 'online' as const;

export interface StoreDef {
  id: StoreId;
  /** Multiplier applied to base item prices. */
  markup: number;
  /** [itemId, normal stock]. */
  stock: Array<[string, number]>;
}

const PHYSICAL: Partial<Record<LocationId, StoreDef>> = {
  supermarket: {
    id: 'supermarket', markup: 1.0,
    stock: [
      ['canned_food', 120], ['canned_veg', 100], ['rice', 80], ['dry_beans', 70], ['pasta', 90],
      ['cooking_oil', 60], ['peanut_butter', 60], ['protein_bars', 50], ['salt_sugar', 80],
      ['bottled_water', 300], ['matches', 120], ['candles', 80], ['batteries', 80],
      ['toilet_paper', 70], ['soap', 70], ['trash_bags', 60],
    ],
  },
  hardware: {
    id: 'hardware', markup: 1.0,
    stock: [
      ['lumber', 100], ['plywood', 60], ['nails', 80], ['screws', 60], ['concrete', 80],
      ['steel_sheet', 40], ['barbed_wire', 50], ['chain_fence', 60], ['fence_posts', 50],
      ['padlock', 40], ['sandbags', 100], ['spikes', 50], ['toolbox', 15], ['axe', 20],
      ['shovel', 30], ['crowbar', 25], ['chainsaw', 8], ['flood_light', 30], ['wire_spool', 30],
      ['power_tools', 6], ['welding_kit', 4], ['spare_parts', 40],
      // Ready-made structures the shop keeps on hand
      ['fence_wood', 60], ['fence_chain', 60], ['fence_barbed', 40], ['wall_cinder', 30],
      ['sandbag_wall', 60], ['gate_wood', 20], ['gate_steel', 8], ['container_20', 12],
      ['container_40', 6], ['generator_5kw', 6], ['generator_10kw', 3], ['solar_panel', 20],
      ['battery_bank', 10], ['water_tank', 10], ['lamp_post', 20], ['workbench', 6],
    ],
  },
  pharmacy: {
    id: 'pharmacy', markup: 1.1,
    stock: [
      ['bandages', 80], ['antiseptic', 60], ['painkillers', 60], ['antibiotics', 30],
      ['first_aid_kit', 40], ['surgical_kit', 8], ['vitamins', 50], ['face_masks', 40],
      ['water_tablets', 60],
    ],
  },
  gun_shop: {
    id: 'gun_shop', markup: 1.0,
    stock: [
      ['pistol', 10], ['rifle', 6], ['shotgun', 8], ['ammo_9mm', 60], ['ammo_rifle', 40],
      ['shells', 50], ['bat', 15], ['machete', 15], ['body_armor', 6], ['binoculars', 8],
      ['gun_safe', 4],
    ],
  },
  farm_supply: {
    id: 'farm_supply', markup: 1.0,
    stock: [
      ['seeds_veg', 50], ['seeds_corn', 40], ['seed_potatoes', 40], ['soil', 40], ['fertilizer', 40],
      ['irrigation_kit', 10], ['animal_feed', 40],
      ['greenhouse_kit', 5], ['rain_collector', 12], ['chicken_coop', 6], ['garden_bed', 20],
      ['beehive', 10], ['well_hand', 5],
    ],
  },
  gas_station: {
    id: 'gas_station', markup: 1.15,
    stock: [
      ['gasoline', 150], ['diesel', 80], ['propane', 40], ['motor_oil', 40], ['jerry_can', 60],
      ['fuel_stabilizer', 30],
    ],
  },
  vehicle_dealer: {
    id: 'vehicle_dealer', markup: 1.0,
    stock: [
      ['bicycle', 6], ['scooter', 4], ['sedan', 3], ['pickup_truck', 3], ['cargo_van', 2], ['suv', 2], ['box_truck', 1],
      ['trailer', 3], ['tow_hitch', 6], ['roof_rack', 6], ['bull_bar', 4], ['extra_tank', 4], ['spare_parts', 30],
    ],
  },
};

/**
 * The online store sells everything the shops do, plus the full range of buildings and fences. It never needs a trip
 * to town and delivers instantly, but costs a little more.
 */
function buildOnlineStore(): StoreDef {
  const stock = new Map<string, number>();
  for (const store of Object.values(PHYSICAL)) {
    for (const [id, n] of store!.stock) stock.set(id, (stock.get(id) ?? 0) + n);
  }
  for (const id of stock.keys()) stock.set(id, Math.round(stock.get(id)! * 1.5));
  for (const s of STRUCTURE_LIST) stock.set(s.id, s.stock);
  return { id: ONLINE_STORE_ID, markup: 1.06, stock: [...stock.entries()] };
}

export const STORES: Partial<Record<StoreId, StoreDef>> = { ...PHYSICAL, online: buildOnlineStore() };

// Fail fast on typos in the data.
for (const store of Object.values(STORES)) {
  for (const [itemId] of store!.stock) {
    if (!ITEMS[itemId]) throw new Error(`Store ${store!.id} lists unknown item "${itemId}"`);
  }
}

export function storeById(id: string): StoreDef | undefined {
  return STORES[id as StoreId];
}

export function isStore(id: string): boolean {
  return storeById(id) !== undefined;
}

/** Display name and description for any store. */
export function storeInfo(id: StoreId): { name: string; blurb: string } {
  if (id === ONLINE_STORE_ID) {
    return {
      name: 'SurvivalMart Online',
      blurb: 'Everything for your base in one place: fences, houses, wells, solar power and supplies. Delivered to your storage, no trip to town.',
    };
  }
  const loc = locationById(id);
  return { name: loc.name, blurb: loc.blurb };
}
