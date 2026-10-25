import { CATEGORIES, itemById } from './items';
import { isStructure, STRUCTURES, type StructureDef } from './structures';
import {
  EAT_ORDER, FUEL_PER_ITEM, MEALS_PER_BASKET, MEALS_PER_ITEM, SURVIVAL, UTILITIES, WATER_PER_ITEM,
} from './survival';

/**
 * The product sheet: for every item in the store, what it is, how it works in this game, what it needs, and the numbers.
 *
 * Numbers and requirements for structures are read from the same tables the simulation uses (data/survival.ts and
 * data/structures.ts), so the sheet cannot drift out of date. Supplies have short hand-written descriptions. Anything the
 * game does not use yet says so, so nobody wastes money on it by mistake.
 */

export interface Stat {
  label: string;
  value: string;
}

export interface ProductInfo {
  /** One plain sentence about what it is. */
  what: string;
  /** What it does in this game: short lines. */
  how: string[];
  /** What has to be true for it to work. */
  needs: string[];
  stats: Stat[];
  /** Whether the game uses it yet. */
  status: { label: string; level: 'works' | 'soon' | 'decor' };
}

const familyWaterPerDay = SURVIVAL.people * SURVIVAL.waterPerPersonDay;
const familyMealsPerDay = SURVIVAL.people * SURVIVAL.mealsPerPersonDay;

const num = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const kw = (n: number) => `${num(n, n < 1 ? 2 : 1)} kW`;
const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${num(minutes / 60, minutes % 60 === 0 ? 0 : 1)} h`);
const days = (n: number) => `${num(n, n < 10 ? 1 : 0)} day${n >= 0.95 && n < 1.05 ? '' : 's'}`;

// ---------------------------------------------------------------- Supplies (hand written)

type Supply = { what: string; how: string[]; soon?: string };

const SUPPLIES: Record<string, Supply> = {
  // Food
  canned_food: { what: 'A case of 24 cans of ready-to-eat food.', how: ['Needs no cooking and keeps for years.', 'The family eats it when there is no fresh produce.'] },
  canned_veg: { what: 'A case of 24 cans of mixed vegetables.', how: ['Needs no cooking and keeps for years.', 'Eaten after fresh produce and spreads, before dry goods.'] },
  rice: { what: 'A 25 kg sack of rice.', how: ['The cheapest way to store a lot of food: one sack is more than a hundred meals.', 'Eaten last, after everything that is quicker to prepare.'] },
  dry_beans: { what: 'A 10 kg sack of dried beans.', how: ['Cheap, filling and keeps for years.', 'Eaten after canned goods.'] },
  pasta: { what: 'A box of 20 packs of pasta.', how: ['Light and quick to prepare.', 'Eaten early, after fresh produce.'] },
  cooking_oil: { what: 'Six liters of cooking oil.', how: ['Makes plain food worth eating and adds calories.'], soon: 'Not eaten by the family yet. It will matter when the kitchen and cooking arrive.' },
  peanut_butter: { what: 'A case of 12 jars of peanut butter.', how: ['A lot of energy in a small jar.', 'Eaten early, with the quick foods.'] },
  protein_bars: { what: 'A box of 48 protein bars.', how: ['Pre-packed and light. Good to carry on supply runs later.', 'Eaten early, with the quick foods.'] },
  salt_sugar: { what: 'Salt and sugar for cooking and preserving.', how: ['Keeps food from spoiling.'], soon: 'Does nothing yet. It will be used for preserving food later.' },
  fresh_food: { what: 'A basket of fresh produce from your farms.', how: ['Harvested automatically and kept in storage.', 'Eaten first, before anything from a can.'] },
  // Water
  bottled_water: { what: 'A case of 24 bottles of clean drinking water.', how: ['Always safe to drink, with no setup.', 'Used only when your wells and tanks cannot supply the family.'] },
  water_tablets: { what: 'A box of 100 purification tablets.', how: ['Makes dirty water safe to drink.'], soon: 'Not used yet. For now raw pond and rain water is cleaned by a powered water filter.' },
  // Household
  matches: { what: 'A box of ten matchbooks.', how: ['Lights fires and stoves when the power is out.'], soon: 'Not used yet.' },
  candles: { what: 'A pack of 24 candles.', how: ['A little light when there is no power.'], soon: 'Not used yet. Lamp posts give light now, once they are connected to power.' },
  batteries: { what: 'A pack of 48 small batteries.', how: ['Powers radios, torches and small gadgets.'], soon: 'Not used yet. Your battery bank is a separate, larger structure.' },
  toilet_paper: { what: 'A pack of 36 rolls.', how: ['Comfort and hygiene for the family.'], soon: 'Not used yet. Hygiene and morale arrive in a later update.' },
  soap: { what: 'A pack of soap and hygiene supplies.', how: ['Used to wash dirty solar panels, rain collectors and greenhouse glass.'] },
  power_tools: { what: 'A set of cordless power tools.', how: ['Needed to upgrade wooden, masonry and sandbag structures. Keep one in storage; it is not used up.', 'Also found on supply runs, once those arrive.'] },
  welding_kit: { what: 'A portable welding kit.', how: ['Needed to upgrade metal and electrical structures. Keep one in storage; it is not used up.', 'Also found on supply runs, once those arrive.'] },
  trash_bags: { what: 'A roll of 100 heavy trash bags.', how: ['Keeps the base clean and stops smells that attract animals.'], soon: 'Not used yet.' },
  // Medical
  bandages: { what: 'A box of bandages and dressings.', how: ['Stops bleeding and covers wounds.'], soon: 'Not used yet. Injuries arrive with the zombies.' },
  antiseptic: { what: 'A bottle of antiseptic.', how: ['Cleans a wound so it does not get infected.'], soon: 'Not used yet. Injuries arrive with the zombies.' },
  painkillers: { what: 'A bottle of painkillers.', how: ['Eases pain so an injured person can keep working.'], soon: 'Not used yet. Injuries arrive with the zombies.' },
  antibiotics: { what: 'A course of antibiotics.', how: ['Treats infections that would otherwise kill.'], soon: 'Not used yet. Illness arrives in a later update.' },
  first_aid_kit: { what: 'A complete first-aid kit.', how: ['Treats most injuries in one go.'], soon: 'Not used yet. Injuries arrive with the zombies.' },
  surgical_kit: { what: 'A surgeon\'s kit with sutures and instruments.', how: ['For serious wounds that bandages cannot fix.'], soon: 'Not used yet. Injuries arrive with the zombies.' },
  vitamins: { what: 'A bottle of 200 vitamin tablets.', how: ['Keeps people healthy when the diet is narrow.'], soon: 'Not used yet.' },
  face_masks: { what: 'A box of 50 face masks.', how: ['Protects against dust, smoke and disease.'], soon: 'Not used yet.' },
  // Materials
  lumber: { what: 'A bundle of 20 boards.', how: ['Repairs and upgrades wooden structures: fences, cabins, towers, beds and barns.'] },
  plywood: { what: 'A stack of ten plywood sheets.', how: ['Quick walls, boarded windows and repairs.'], soon: 'Not used yet. Materials arrive with repairs.' },
  nails: { what: 'A box of 1,000 nails.', how: ['Goes with lumber when you repair or upgrade wooden structures.'] },
  screws: { what: 'A box of 500 screws.', how: ['Goes with steel and wire when you repair or upgrade metal and electrical structures.'] },
  concrete: { what: 'A pallet of concrete mix.', how: ['Repairs and upgrades walls, bunkers, solid houses and ponds.'] },
  steel_sheet: { what: 'A stack of five steel sheets.', how: ['Repairs and upgrades metal structures: chain-link, gates, wells, tanks, containers and greenhouses.'] },
  barbed_wire: { what: 'A 100 m roll of barbed wire.', how: ['Makes a fence harder to climb.'], soon: 'Not used yet. Buy the finished barbed-wire fence instead.' },
  chain_fence: { what: 'A 10 m roll of chain-link mesh.', how: ['Raw mesh for fencing.'], soon: 'Not used yet. Buy the finished chain-link fence instead.' },
  fence_posts: { what: 'A bundle of ten fence posts.', how: ['Supports a fence line.'], soon: 'Not used yet. Buy the finished fences instead.' },
  padlock: { what: 'A heavy padlock.', how: ['Keeps a gate shut.'], soon: 'Not used yet.' },
  sandbags: { what: 'A bundle of 50 sandbags filled with sand.', how: ['Repairs and upgrades sandbag walls and gun nests.'] },
  spikes: { what: 'A bundle of 20 steel spikes.', how: ['Makes traps and sharpened barriers.'], soon: 'Not used yet. Buy the finished spike trap instead.' },
  // Tools
  toolbox: { what: 'A full toolbox.', how: ['Needed to repair anything. Keep one in storage; it is not used up.'] },
  axe: { what: 'A felling axe.', how: ['Cuts wood. Also a decent weapon.'], soon: 'Not used yet.' },
  shovel: { what: 'A digging shovel.', how: ['Needed to clean out ponds when they silt up. Keep one in storage; it is not used up.'] },
  crowbar: { what: 'A steel crowbar.', how: ['Opens doors and crates. Also a weapon.'], soon: 'Not used yet. Useful on supply runs later.' },
  chainsaw: { what: 'A petrol chainsaw.', how: ['Clears trees fast. Loud, so it draws zombies.'], soon: 'Not used yet.' },
  flood_light: { what: 'A portable LED flood light.', how: ['A bright light for a corner of the base.'], soon: 'Not used yet. Buy the floodlight tower to light your perimeter.' },
  // Power
  wire_spool: { what: 'A 100 m spool of electrical wire.', how: ['Repairs and upgrades solar panels, batteries, generators, poles and lights.'] },
  // Farming
  seeds_veg: { what: 'An assorted bundle of vegetable seeds.', how: ['Each garden bed uses 1 bundle per crop, a greenhouse 2 and a large greenhouse 3.', 'Without them a farm cannot start a new crop.'] },
  seeds_corn: { what: 'A bag of corn seeds.', how: ['A staple crop that stores well.'], soon: 'Not used yet. Gardens and greenhouses plant vegetable seeds.' },
  seed_potatoes: { what: 'Ten kilograms of seed potatoes.', how: ['A reliable crop in poor soil.'], soon: 'Not used yet. Gardens and greenhouses plant vegetable seeds.' },
  soil: { what: 'A pallet of potting soil.', how: ['Rich soil for beds and greenhouses.'], soon: 'Not used yet.' },
  fertilizer: { what: 'A 25 kg bag of fertilizer.', how: ['Makes crops grow bigger.'], soon: 'Not used yet.' },
  irrigation_kit: { what: 'A kit of hoses and drip lines.', how: ['Waters a farm automatically.'], soon: 'Not used yet. Farms are watered by connecting them to a tank or well.' },
  animal_feed: { what: 'A 25 kg sack of animal feed.', how: ['A chicken coop uses 1 sack to start each laying cycle.', 'Without it the coop stops producing.'] },
  // Fuel
  gasoline: { what: 'A 20 liter can of gasoline.', how: ['Burned by generators, only when the base needs more power than the sun and batteries give.', 'Keep a few cans in storage: a generator with no fuel stops at once.'] },
  diesel: { what: 'A 20 liter can of diesel.', how: ['Burned by generators exactly like gasoline.', 'Used after gasoline runs out.'] },
  propane: { what: 'A propane gas tank.', how: ['Fuel for stoves and heaters.'], soon: 'Not used yet. It will fuel the kitchen later.' },
  motor_oil: { what: 'Five liters of motor oil.', how: ['Keeps engines running.'], soon: 'Not used yet. Vehicles arrive with supply runs.' },
  jerry_can: { what: 'An empty fuel can.', how: ['Carries fuel from the gas station.'], soon: 'Not used yet. Fuel cans come full when you buy gasoline.' },
  fuel_stabilizer: { what: 'A bottle of fuel stabilizer.', how: ['Stops stored fuel from going bad.'], soon: 'Not used yet.' },
  // Weapons
  pistol: { what: 'A 9 mm pistol.', how: ['Light and quick, short range.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  rifle: { what: 'A hunting rifle.', how: ['Long range and accurate. Loud.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  shotgun: { what: 'A pump shotgun.', how: ['Devastating up close, poor at range.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  ammo_9mm: { what: 'A box of 50 pistol rounds.', how: ['Ammunition for the pistol.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  ammo_rifle: { what: 'A box of 20 rifle rounds.', how: ['Ammunition for the hunting rifle.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  shells: { what: 'A box of 25 shotgun shells.', how: ['Ammunition for the shotgun.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  bat: { what: 'A wooden baseball bat.', how: ['A quiet weapon that never runs out.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  machete: { what: 'A heavy machete.', how: ['A quiet weapon for close work.'], soon: 'Not used yet. Weapons arrive with the zombies.' },
  body_armor: { what: 'A body armor vest.', how: ['Absorbs bites and blows.'], soon: 'Not used yet. Weapons and armor arrive with the zombies.' },
  binoculars: { what: 'A pair of binoculars.', how: ['See threats from far away.'], soon: 'Not used yet.' },
  gun_safe: { what: 'A steel gun safe.', how: ['Keeps weapons safe from thieves.'], soon: 'Not used yet.' },
  // Vehicles
  pickup_truck: { what: 'A used pickup truck.', how: ['Carries a good load on supply runs.'], soon: 'Not used yet. Vehicles arrive with supply runs.' },
  cargo_van: { what: 'A cargo van.', how: ['A large closed load space.'], soon: 'Not used yet. Vehicles arrive with supply runs.' },
  suv: { what: 'A family SUV.', how: ['Fast and comfortable, with room for people.'], soon: 'Not used yet. Vehicles arrive with supply runs.' },
  trailer: { what: 'A utility trailer.', how: ['Doubles what a vehicle can haul.'], soon: 'Not used yet. Vehicles arrive with supply runs.' },
};

function supplyInfo(id: string): ProductInfo {
  const item = itemById(id);
  const text = SUPPLIES[id] ?? { what: item.name, how: [], soon: 'Not used yet.' };
  const stats: Stat[] = [{ label: 'Comes as', value: item.unit }];
  let works = false;

  const meals = MEALS_PER_ITEM[id];
  if (meals) {
    works = true;
    stats.push({ label: 'Meals', value: num(meals) }, { label: 'Feeds your family', value: days(meals / familyMealsPerDay) });
    const rank = EAT_ORDER.indexOf(id);
    stats.push({ label: 'Eaten', value: rank <= 1 ? 'first' : rank >= EAT_ORDER.length - 2 ? 'last' : 'in the middle' });
  }
  const litres = WATER_PER_ITEM[id];
  if (litres) {
    works = true;
    stats.push({ label: 'Water', value: `${num(litres)} L` }, { label: 'Lasts your family', value: days(litres / familyWaterPerDay) });
  }
  const fuel = FUEL_PER_ITEM[id];
  if (fuel) {
    works = true;
    const hours = fuel / (5 * SURVIVAL.fuelLitersPerKwh);
    stats.push({ label: 'Fuel', value: `${num(fuel)} L` }, { label: '5 kW generator', value: `${num(hours, 0)} h at full load` });
  }
  if (id === 'seeds_veg') {
    works = true;
    stats.push({ label: 'Per crop', value: '1 / 2 / 3' }, { label: 'Garden, greenhouse, large', value: 'bundles' });
  }
  if (id === 'animal_feed') {
    works = true;
    stats.push({ label: 'Per laying cycle', value: '1 sack' }, { label: 'Cycle', value: '4 days' });
  }
  if (id === 'fresh_food') {
    works = true;
    stats.push({ label: 'Meals', value: num(MEALS_PER_BASKET) }, { label: 'Sold in shops', value: 'No, grow it' });
  }

  const needs: string[] = [];
  const how = [...text.how];
  if (!works && text.soon) how.push(text.soon);
  return {
    what: text.what,
    how,
    needs,
    stats,
    status: works ? { label: 'Works in the game', level: 'works' } : { label: 'Not used yet', level: 'soon' },
  };
}

// ---------------------------------------------------------------- Structures (derived)

const SHELTER_IDS = new Set(['tent_large', 'prefab_home', 'cabin_small', 'house_family', 'house_large', 'bunker']);

/** A clearer opening sentence for structures whose blurb starts with a bare verb or fragment. */
const WHAT: Record<string, string> = {
  garden_bed: 'A wooden raised bed of rich soil for growing vegetables.',
  greenhouse_kit: 'A glass greenhouse that grows vegetables all year round, safe from frost.',
  greenhouse_large: 'A big greenhouse with twice the growing space and its own watering line.',
  orchard_plot: 'A small orchard of young apple and pear trees.',
  chicken_coop: 'A coop of laying hens that give eggs and meat.',
  beehive: 'A wooden beehive that gives a little honey.',
  tree_apple: 'An apple tree that gives a little fruit.',
  lamp_post: 'A street lamp for your base.',
  floodlight_tower: 'A tall floodlight on a steel frame.',
  fence_electric: 'A fence with live wire along the top.',
  generator_5kw: 'A 5 kW fuel generator.',
  generator_10kw: 'A 10 kW fuel generator for a whole base.',
  rain_collector: 'A barrel under a roof gutter that collects rainwater.',
  water_filter: 'A purification station that cleans raw water.',
  well_hand: 'A dug well with a hand pump.',
  pond_fish: 'A stocked pond with fish.',
  pond_large: 'A wide pond with lily pads.',
  pond_small: 'A small pond ringed with stones and reeds.',
};

/** Extra, honest notes for structures whose effect is not obvious from the numbers. */
const EXTRA_HOW: Record<string, string> = {
  scarecrow: 'Crows do not raid crops in this version, so for now it is decoration.',
  barn: 'A large building for animals, hay and machines. Animals and machines arrive in a later update, so it only looks the part for now.',
  garage: 'Covered space for a truck and its fuel. Vehicles arrive with supply runs.',
  shed_small: 'A lockable store for tools and spare parts. Tools and repairs arrive in a later update.',
  warehouse: 'Covered bulk storage. Your supplies are kept in one shared storage whether or not you build one, and it has no size limit yet.',
  crate_stack: 'A stack of wooden crates. Your storage has no size limit yet, so it is for looks.',
  fuel_tank: 'A steel tank for fuel. Fuel cans stay in your storage and generators take from there, so it is for looks for now.',
  workbench: 'A bench for repairs and crafting. Both arrive in a later update.',
  outdoor_kitchen: 'A stove and prep table. Cooking arrives in a later update. For now the family eats straight from storage.',
  bunk_beds: 'Sleeping space for four. Sleep and tiredness are not in the game yet.',
  medical_station: 'Treats the sick and hurt once injuries arrive with the zombies.',
  radio_mast: 'Hears broadcasts from far away. Broadcasts and survivors arrive in a later update.',
  lamp_post: 'Lights a small area around it at night.',
  floodlight_tower: 'Lights the perimeter so you can see what is coming.',
  fence_electric: 'Shocks whatever touches it. Each piece draws a little power, so a long fence needs a real source behind it.',
  watchtower: 'A raised platform that shows threats early. Guards arrive with the zombies.',
  spike_strip: 'Hurts what walks over it. Zombies arrive with the outbreak.',
  sandbag_nest: 'A curved wall of sandbags with room for two shooters. Shooting arrives with the zombies.',
  trench: 'A deep ditch that slows the dead before they reach your wall. Zombies arrive with the outbreak.',
  pond_small: 'Also a small source of raw water for crops.',
  pond_large: 'Also a good source of raw water for crops.',
  pond_fish: 'Also a source of raw water for crops.',
  fire_pit: 'A glowing fire at night that you can hear crackle. Purely for atmosphere.',
  hedge: 'Screens your land from the road.',
  windmill: 'Looks great and works without power, but only pumps while the wind blows.',
};

function structureInfo(def: StructureDef): ProductInfo {
  const u = UTILITIES[def.id];
  const stats: Stat[] = [
    { label: 'Size', value: `${def.w * 2} x ${def.d * 2} m` },
    { label: 'Build time', value: duration(def.buildMinutes) },
    { label: 'Toughness', value: `${num(def.hp)} HP` },
  ];
  const how: string[] = [];
  const needs: string[] = [];

  const p = u?.power;
  if (p) {
    if (p.makeKw && p.source === 'sun') {
      how.push('Makes power from sunlight, and nothing at night.');
      stats.push({ label: 'Makes', value: `${kw(p.makeKw)} at noon` });
    } else if (p.makeKw && p.source === 'wind') {
      how.push('Makes power when the wind blows. The wind comes and goes over a few days.');
      stats.push({ label: 'Makes', value: `up to ${kw(p.makeKw)}` });
    } else if (p.makeKw && p.source === 'fuel') {
      how.push('Starts by itself when the base needs more power than the sun and batteries give, and stops when it does not.');
      stats.push({ label: 'Makes', value: kw(p.makeKw) }, { label: 'Fuel use', value: `${num(p.makeKw * SURVIVAL.fuelLitersPerKwh, 1)} L/h at full load` });
      needs.push('Gasoline or diesel in storage');
    }
    if (p.storeKwh) {
      how.push('Stores spare power from panels and turbines and gives it back at night.');
      stats.push({ label: 'Stores', value: `${num(p.storeKwh)} kWh` }, { label: 'Runs a lamp', value: `${num(p.storeKwh / 0.08)} h` });
    }
    if (p.useKw) {
      how.push(p.darkOnly ? 'Only draws power in the dark.' : 'Draws power all the time.');
      stats.push({ label: 'Uses', value: `${kw(p.useKw)}${p.darkOnly ? ' at night' : ''}` });
      needs.push('A power connection: within 5 m of a generator, solar panel or battery, or within 14 m of a power pole');
    }
    if (!p.makeKw && !p.storeKwh && !p.useKw) {
      how.push('Joins every power source and machine within its reach into one network, with no wires to place.');
    }
    stats.push({ label: 'Power reach', value: `${num(p.reach)} m` });
  }

  const w = u?.water;
  if (w) {
    if (w.makeLph) {
      const perDay = w.makeLph * 24;
      if (w.source === 'ground') how.push('Pumps water day and night.');
      else if (w.source === 'wind') how.push('Pumps water while the wind blows, about half the time.');
      else if (w.source === 'rain') how.push('Collects a small steady trickle of rainwater.');
      else if (w.source === 'pond') how.push('Provides water for crops. Needs a filter before people can drink it.');
      stats.push({ label: 'Makes', value: `${num(w.makeLph)} L/h` }, { label: 'Per day', value: `${num(perDay)} L` });
      if (!w.raw) stats.push({ label: 'Your family drinks', value: `${num(familyWaterPerDay)} L/day` });
      if (w.raw) {
        how.push('Raw water: crops can use it as it is. To drink it you need a powered water filter in range.');
        needs.push('A powered water filter in range, to make it drinkable');
      }
    }
    if (w.storeL) {
      how.push('Holds water for when the source is off or the crops are thirsty. Tanks fill evenly, and the family drinks from them first.');
      stats.push({ label: 'Holds', value: `${num(w.storeL)} L` }, { label: 'Family supply', value: days(w.storeL / familyWaterPerDay) });
      needs.push('A well or collector within reach to fill it');
    }
    if (w.filterLph) {
      how.push('Cleans raw water from ponds and rain collectors so it is safe to drink.');
      stats.push({ label: 'Cleans', value: `${num(w.filterLph)} L/h` });
      needs.push('A power connection, and a pond or rain collector in water reach');
    }
    if (!w.makeLph && !w.storeL && !w.filterLph && !u?.farm) {
      how.push('Joins every well, tank and farm within its reach into one water network, with no pipes to place.');
    }
    stats.push({ label: 'Water reach', value: `${num(w.reach)} m` });
  }

  const f = u?.farm;
  if (f) {
    const perDay = f.meals / f.days;
    how.push(`Every ${f.days} days it gives ${num(f.meals)} meals, collected into storage as fresh produce.`);
    stats.push(
      { label: 'Harvest', value: `${num(f.meals)} meals` },
      { label: 'Every', value: `${f.days} days` },
      { label: 'Feeds', value: `${num(perDay, 1)} of your ${num(familyMealsPerDay)} daily meals` },
    );
    if (f.waterPerDay > 0) {
      stats.push({ label: 'Water use', value: `${num(f.waterPerDay)} L/day` });
      needs.push('A water connection: within 6 m of a tank or well, or within 14 m of a pipe junction');
    } else {
      how.push('Needs no water or care.');
    }
    if (f.seeds) needs.push(`${f.seeds.qty} bundle${f.seeds.qty > 1 ? 's' : ''} of vegetable seeds at the start of each crop`);
    if (f.feed) needs.push(`${f.feed.qty} sack of animal feed at the start of each cycle`);
  }

  if (w?.makeLph && !p) how.push('Needs no power to run.');
  if (def.barrier) {
    how.push('A barrier: zombies must break through it, so it will hold them back once the outbreak starts.');
    if (!u) stats.push({ label: 'Blocks', value: 'zombies' });
  }
  if (def.group === 'fences' && def.w === 1) how.push('Placed one 2 m piece at a time. Drag across your land to lay a whole line.');
  if (def.group === 'houses') how.push('Counts as a roof for your family in the advisor.');
  const extra = EXTRA_HOW[def.id];
  if (extra) how.push(extra);
  if (!how.length) {
    how.push(def.group === 'landscape' ? 'Makes the base look like a home. It never needs anything.' : 'Placed on your land like any structure.');
  }

  const shelter = SHELTER_IDS.has(def.id);
  let status: ProductInfo['status'];
  if (u) status = { label: 'Works in the game', level: 'works' };
  else if (shelter) status = { label: 'Works in the game', level: 'works' };
  else if (def.barrier) status = { label: 'Defends once zombies arrive', level: 'soon' };
  else if (def.group === 'landscape') status = { label: 'Decoration', level: 'decor' };
  else status = { label: 'Looks only for now', level: 'decor' };

  // The first sentence says what it is. Later sentences usually repeat the requirements shown below, except for plain items.
  const sentences = def.blurb.split(/(?<=\.)\s+/);
  if (!u && sentences.length > 1) how.unshift(...sentences.slice(1));
  return { what: WHAT[def.id] ?? sentences[0], how, needs, stats: stats.slice(0, 9), status };
}

// ---------------------------------------------------------------- Entry point

export function productInfo(itemId: string): ProductInfo {
  return isStructure(itemId) ? structureInfo(STRUCTURES[itemId]) : supplyInfo(itemId);
}

/** The shop category name for a product, for the sheet's header. */
export function productKind(itemId: string): string {
  return CATEGORIES[itemById(itemId).category].label;
}
