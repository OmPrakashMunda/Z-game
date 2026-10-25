import { CELL, STRUCTURE_LIST } from './structures';

export type Category =
  | 'food' | 'water' | 'household' | 'medical' | 'materials'
  | 'tools' | 'power' | 'farming' | 'fuel' | 'weapons' | 'vehicles'
  | 'fences' | 'houses' | 'landscape' | 'waterworks' | 'defense' | 'storage' | 'utility';

export interface CategoryInfo {
  label: string;
  /** Icon name (see ui/icons.ts). */
  icon: string;
  /** Accent colour used behind the icon. */
  color: string;
  /** How strongly panic-buying affects this category (0 = not at all). */
  panic: number;
}

/** Building categories come first, so the online store opens on things for your base. */
export const CATEGORIES: Record<Category, CategoryInfo> = {
  fences: { label: 'Fences, walls and gates', icon: 'Fence', color: '#7f8a96', panic: 0.5 },
  houses: { label: 'Houses and shelters', icon: 'House', color: '#c9783a', panic: 0.3 },
  landscape: { label: 'Ponds, trees and paths', icon: 'TreePine', color: '#3f9a58', panic: 0.2 },
  waterworks: { label: 'Wells and water', icon: 'Waves', color: '#2a8fb8', panic: 0.6 },
  power: { label: 'Power', icon: 'Zap', color: '#c9a21c', panic: 0.7 },
  farming: { label: 'Farming', icon: 'Sprout', color: '#3e9f50', panic: 0.4 },
  defense: { label: 'Defense', icon: 'Shield', color: '#b04a4a', panic: 0.7 },
  storage: { label: 'Storage', icon: 'Warehouse', color: '#8f7a5a', panic: 0.3 },
  utility: { label: 'Utility', icon: 'Cog', color: '#6a7fb0', panic: 0.3 },
  materials: { label: 'Materials', icon: 'Construction', color: '#9a7449', panic: 0.5 },
  tools: { label: 'Tools', icon: 'Wrench', color: '#62758f', panic: 0.4 },
  food: { label: 'Food', icon: 'Utensils', color: '#c98a1f', panic: 1.0 },
  water: { label: 'Water', icon: 'Droplets', color: '#2f8fd0', panic: 1.2 },
  household: { label: 'Household', icon: 'Bath', color: '#8a6fc4', panic: 0.7 },
  medical: { label: 'Medical', icon: 'HeartPulse', color: '#cc4b5c', panic: 1.0 },
  fuel: { label: 'Fuel', icon: 'Fuel', color: '#d0682a', panic: 1.0 },
  weapons: { label: 'Weapons', icon: 'Crosshair', color: '#7c8594', panic: 1.0 },
  vehicles: { label: 'Vehicles', icon: 'Truck', color: '#3a9c9c', panic: 0.25 },
};

/** Categories whose products are placed on the base plot. */
export const BUILDING_CATEGORIES: readonly Category[] = [
  'fences', 'houses', 'landscape', 'waterworks', 'power', 'farming', 'defense', 'storage', 'utility',
];
export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  /** Base price in dollars per unit, before store markup and panic. */
  price: number;
  /** What one unit is, such as "case of 24". */
  unit: string;
  /** Icon name (see ui/icons.ts). */
  icon: string;
  /** Extra detail shown in stores, such as the size of a building. */
  note?: string;
}

// id, name, category, price, unit, icon name
const RAW: Array<[string, string, Category, number, string, string]> = [
  // Food
  ['canned_food', 'Canned food', 'food', 55, 'case of 24', 'Soup'],
  ['canned_veg', 'Canned vegetables', 'food', 48, 'case of 24', 'Carrot'],
  ['rice', 'Rice', 'food', 38, '25 kg sack', 'Wheat'],
  ['dry_beans', 'Dried beans', 'food', 26, '10 kg sack', 'Bean'],
  ['pasta', 'Pasta', 'food', 30, 'box of 20', 'Utensils'],
  ['cooking_oil', 'Cooking oil', 'food', 24, '6 L', 'Droplet'],
  ['peanut_butter', 'Peanut butter', 'food', 42, 'case of 12', 'Nut'],
  ['protein_bars', 'Protein bars', 'food', 60, 'box of 48', 'Candy'],
  ['salt_sugar', 'Salt and sugar', 'food', 12, 'bundle', 'Cookie'],
  ['fresh_food', 'Fresh produce', 'food', 12, 'basket of 6 meals', 'Carrot'],
  // Water
  ['bottled_water', 'Bottled water', 'water', 14, 'case of 24', 'GlassWater'],
  ['water_tablets', 'Purification tablets', 'water', 18, 'box of 100', 'Pill'],
  // Household
  ['matches', 'Matches', 'household', 8, 'box of 10', 'Flame'],
  ['candles', 'Candles', 'household', 10, 'pack of 24', 'FlameKindling'],
  ['batteries', 'Batteries', 'household', 32, 'pack of 48', 'Battery'],
  ['toilet_paper', 'Toilet paper', 'household', 28, 'pack of 36', 'Scroll'],
  ['soap', 'Soap and hygiene', 'household', 15, 'pack', 'Bath'],
  ['trash_bags', 'Trash bags', 'household', 9, 'roll of 100', 'Trash2'],
  // Medical
  ['bandages', 'Bandages', 'medical', 18, 'box', 'Bandage'],
  ['antiseptic', 'Antiseptic', 'medical', 14, 'bottle', 'Pipette'],
  ['painkillers', 'Painkillers', 'medical', 22, 'bottle', 'Pill'],
  ['antibiotics', 'Antibiotics', 'medical', 65, 'course', 'Pill'],
  ['first_aid_kit', 'First-aid kit', 'medical', 55, 'kit', 'Cross'],
  ['surgical_kit', 'Surgical kit', 'medical', 220, 'kit', 'Stethoscope'],
  ['vitamins', 'Vitamins', 'medical', 19, 'bottle of 200', 'Citrus'],
  ['face_masks', 'Face masks', 'medical', 28, 'box of 50', 'ShieldCheck'],
  // Materials
  ['lumber', 'Lumber', 'materials', 180, 'bundle of 20', 'Ruler'],
  ['plywood', 'Plywood sheets', 'materials', 320, 'stack of 10', 'Layers'],
  ['nails', 'Nails', 'materials', 25, 'box of 1000', 'Anvil'],
  ['screws', 'Screws', 'materials', 28, 'box of 500', 'Bolt'],
  ['concrete', 'Concrete mix', 'materials', 90, 'pallet', 'Blocks'],
  ['steel_sheet', 'Steel sheets', 'materials', 420, 'stack of 5', 'Cuboid'],
  ['barbed_wire', 'Barbed wire', 'materials', 60, 'roll of 100 m', 'Cable'],
  ['chain_fence', 'Chain-link fence', 'materials', 140, 'roll of 10 m', 'Fence'],
  ['fence_posts', 'Fence posts', 'materials', 75, 'bundle of 10', 'Construction'],
  ['padlock', 'Heavy padlock', 'materials', 35, 'each', 'Lock'],
  ['sandbags', 'Sandbags with sand', 'materials', 65, 'bundle of 50', 'Weight'],
  ['spikes', 'Steel spikes', 'materials', 120, 'bundle of 20', 'Triangle'],
  // Tools
  ['toolbox', 'Toolbox', 'tools', 160, 'each', 'Hammer'],
  ['axe', 'Axe', 'tools', 45, 'each', 'Axe'],
  ['shovel', 'Shovel', 'tools', 38, 'each', 'Shovel'],
  ['power_tools', 'Power tool set', 'tools', 380, 'set', 'Drill'],
  ['welding_kit', 'Welding kit', 'tools', 520, 'kit', 'Flame'],
  ['crowbar', 'Crowbar', 'tools', 28, 'each', 'Wrench'],
  ['chainsaw', 'Chainsaw', 'tools', 380, 'each', 'Drill'],
  ['flood_light', 'LED flood light', 'tools', 85, 'each', 'Lightbulb'],
  // Power
  ['wire_spool', 'Electrical wire', 'power', 60, 'spool of 100 m', 'Cable'],
  // Farming
  ['seeds_veg', 'Vegetable seeds', 'farming', 24, 'assorted bundle', 'Sprout'],
  ['seeds_corn', 'Corn seeds', 'farming', 30, 'bag', 'Wheat'],
  ['seed_potatoes', 'Seed potatoes', 'farming', 34, '10 kg', 'Apple'],
  ['soil', 'Potting soil', 'farming', 55, 'pallet', 'Mountain'],
  ['fertilizer', 'Fertilizer', 'farming', 45, '25 kg bag', 'FlaskConical'],
  ['irrigation_kit', 'Irrigation kit', 'farming', 210, 'kit', 'Waves'],
  ['animal_feed', 'Animal feed', 'farming', 38, '25 kg sack', 'Wheat'],
  // Fuel
  ['gasoline', 'Gasoline', 'fuel', 36, '20 L can', 'Fuel'],
  ['diesel', 'Diesel', 'fuel', 38, '20 L can', 'Fuel'],
  ['propane', 'Propane tank', 'fuel', 48, 'each', 'Flame'],
  ['motor_oil', 'Motor oil', 'fuel', 16, '5 L', 'Droplet'],
  ['jerry_can', 'Empty fuel can', 'fuel', 22, 'each', 'Barrel'],
  ['fuel_stabilizer', 'Fuel stabilizer', 'fuel', 14, 'bottle', 'FlaskConical'],
  // Weapons
  ['pistol', 'Pistol, 9 mm', 'weapons', 620, 'each', 'Crosshair'],
  ['rifle', 'Hunting rifle', 'weapons', 1150, 'each', 'Target'],
  ['shotgun', 'Shotgun', 'weapons', 780, 'each', 'Crosshair'],
  ['ammo_9mm', '9 mm ammo', 'weapons', 28, 'box of 50', 'Disc'],
  ['ammo_rifle', 'Rifle ammo', 'weapons', 42, 'box of 20', 'Disc'],
  ['shells', 'Shotgun shells', 'weapons', 24, 'box of 25', 'Disc'],
  ['bat', 'Baseball bat', 'weapons', 35, 'each', 'Dumbbell'],
  ['machete', 'Machete', 'weapons', 55, 'each', 'Sword'],
  ['body_armor', 'Body armor vest', 'weapons', 450, 'each', 'Shield'],
  ['binoculars', 'Binoculars', 'weapons', 90, 'each', 'Binoculars'],
  ['gun_safe', 'Gun safe', 'weapons', 600, 'each', 'LockKeyhole'],
  // Vehicles
  ['pickup_truck', 'Pickup truck', 'vehicles', 18500, 'each', 'Truck'],
  ['cargo_van', 'Cargo van', 'vehicles', 22000, 'each', 'Bus'],
  ['suv', 'SUV', 'vehicles', 16000, 'each', 'CarFront'],
  ['trailer', 'Utility trailer', 'vehicles', 4200, 'each', 'Caravan'],
];

function buildTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min to build`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h to build`;
}

const BASIC_ITEMS: Array<[string, ItemDef]> = RAW.map(([id, name, category, price, unit, icon]) => [
  id, { id, name, category, price, unit, icon },
]);

/** Placeable structures are also items, so they can be bought, delivered, stored and then placed. */
const STRUCTURE_ITEMS: Array<[string, ItemDef]> = STRUCTURE_LIST.map((s) => [
  s.id,
  {
    id: s.id,
    name: s.name,
    category: s.group,
    price: s.price,
    unit: 'each',
    icon: s.icon,
    note: `${s.w * CELL} x ${s.d * CELL} m, ${buildTime(s.buildMinutes)}`,
  },
]);

export const ITEMS: Record<string, ItemDef> = Object.fromEntries([...BASIC_ITEMS, ...STRUCTURE_ITEMS]);

export function itemById(id: string): ItemDef {
  const item = ITEMS[id];
  if (!item) throw new Error(`Unknown item "${id}"`);
  return item;
}
