import { isStructure } from './structures';
import { ITEMS, type Category } from './items';

/**
 * How heavy things are to carry. A "unit" is whatever the store sells as one: a case of cans, a sack of rice, a fuel can.
 * Structures and vehicles are never carried: they are delivered to your storage or parked.
 */

/** What a backpack holds, in kilograms. */
export const PACK_KG = 25;

const BY_CATEGORY: Partial<Record<Category, number>> = {
  food: 10,
  water: 14,
  household: 3,
  medical: 1.5,
  materials: 25,
  tools: 5,
  power: 12,
  farming: 12,
  fuel: 17,
  weapons: 4,
  vehicles: 4,
};

const BY_ITEM: Record<string, number> = {
  lumber: 70, plywood: 60, concrete: 110, steel_sheet: 90, sandbags: 18, barbed_wire: 20, chain_fence: 30, fence_posts: 28,
  nails: 3, screws: 3, padlock: 1, spikes: 10, wire_spool: 12,
  rice: 25, dry_beans: 10, salt_sugar: 4, cooking_oil: 6, protein_bars: 4, bottled_water: 24, water_tablets: 0.5, canned_food: 12,
  matches: 0.3, candles: 2, batteries: 5, toilet_paper: 3, soap: 2,
  gasoline: 17, diesel: 17, propane: 14, motor_oil: 5, jerry_can: 2, fuel_stabilizer: 0.6,
  toolbox: 8, axe: 2.5, shovel: 3, crowbar: 2, chainsaw: 7, power_tools: 9, welding_kit: 14, flood_light: 3,
  pistol: 1, rifle: 4, shotgun: 3.5, ammo_9mm: 1, ammo_rifle: 1.5, shells: 1.5, bat: 1, machete: 1, body_armor: 5, binoculars: 0.8, gun_safe: 60,
  seeds_veg: 0.5, seeds_corn: 0.5, seed_potatoes: 6, soil: 20, fertilizer: 18, animal_feed: 20, irrigation_kit: 8,
  spare_parts: 6, first_aid_kit: 2, surgical_kit: 3,
};

/** Kilograms per unit of an item. */
export function weightOf(itemId: string): number {
  const own = BY_ITEM[itemId];
  if (own !== undefined) return own;
  const item = ITEMS[itemId];
  return (item && BY_CATEGORY[item.category]) ?? 5;
}

/** Whether a person can pick the item up and carry it (supplies, tools, fuel, parts: not buildings or vehicles). */
export function isCarriable(itemId: string): boolean {
  if (!ITEMS[itemId] || isStructure(itemId)) return false;
  if (ITEMS[itemId].category === 'vehicles') return itemId === 'spare_parts';
  return true;
}

export function weightOfAll(items: Record<string, number>): number {
  let sum = 0;
  for (const [id, n] of Object.entries(items)) sum += weightOf(id) * n;
  return sum;
}
