import type { Category } from './items';

/** Which model builder draws the structure (see render/structures.ts). */
export type ModelKind =
  | 'fence' | 'wall' | 'container' | 'sandbags' | 'gate' | 'house' | 'tent' | 'bunker' | 'well' | 'tank'
  | 'solar' | 'turbine' | 'generator' | 'battery' | 'greenhouse' | 'garden' | 'coop' | 'orchard' | 'hive'
  | 'tower' | 'floodlight' | 'spikes' | 'trench' | 'crates' | 'shed' | 'warehouse' | 'workbench' | 'kitchen'
  | 'mast' | 'bunk' | 'lamp' | 'medical' | 'fueltank' | 'filter' | 'rain' | 'pole' | 'pipe'
  | 'pond' | 'tree' | 'hedge' | 'flowers' | 'path' | 'firepit' | 'bench' | 'picnic' | 'flagpole' | 'boulder'
  | 'scarecrow' | 'windmill' | 'barn' | 'garage';

export interface StructureDef {
  /** Same id as the matching item, so a structure can be bought, stored and placed. */
  id: string;
  name: string;
  blurb: string;
  /** Store category it is listed under. */
  group: Category;
  /** Footprint in grid cells (1 cell = 2 m), before rotation. */
  w: number;
  d: number;
  price: number;
  hp: number;
  /** Game minutes of work to build it once placed. */
  buildMinutes: number;
  /** Units the online store keeps in stock. */
  stock: number;
  icon: string;
  /** Stops zombies until it is destroyed. */
  barrier?: boolean;
  look: { model: ModelKind; variant?: string; color?: number; color2?: number };
}

/** Size of one grid cell on a base plot, in meters. */
export const CELL = 2;

const S = (def: StructureDef): StructureDef => def;

export const STRUCTURE_LIST: StructureDef[] = [
  // ---- Fences, walls and gates
  S({ id: 'fence_wood', name: 'Wooden picket fence', blurb: 'Cheap and quick. Keeps animals out, barely slows the dead.', group: 'fences', w: 1, d: 1, price: 120, hp: 120, buildMinutes: 20, stock: 400, icon: 'Fence', barrier: true, look: { model: 'fence', variant: 'picket', color: 0xd8c9a0 } }),
  S({ id: 'fence_chain', name: 'Chain-link fence', blurb: 'Sturdy mesh on steel posts. See-through, so you can watch what is coming.', group: 'fences', w: 1, d: 1, price: 180, hp: 200, buildMinutes: 25, stock: 400, icon: 'Fence', barrier: true, look: { model: 'fence', variant: 'chain', color: 0x9aa3ab } }),
  S({ id: 'fence_barbed', name: 'Barbed-wire fence', blurb: 'Chain-link topped with razor wire. Hurts anything that climbs it.', group: 'fences', w: 1, d: 1, price: 260, hp: 220, buildMinutes: 30, stock: 300, icon: 'Fence', barrier: true, look: { model: 'fence', variant: 'barbed', color: 0x7d858c } }),
  S({ id: 'fence_electric', name: 'Electric fence', blurb: 'Shocks anything that touches it. Needs a power connection: each piece draws a little power.', group: 'fences', w: 1, d: 1, price: 950, hp: 260, buildMinutes: 40, stock: 160, icon: 'Zap', barrier: true, look: { model: 'fence', variant: 'electric', color: 0xe8e0a0 } }),
  S({ id: 'fence_palisade', name: 'Log palisade', blurb: 'Sharpened logs set side by side. Heavy, strong and made from local timber.', group: 'fences', w: 1, d: 1, price: 380, hp: 420, buildMinutes: 45, stock: 250, icon: 'Construction', barrier: true, look: { model: 'fence', variant: 'palisade', color: 0x7a5a37 } }),
  S({ id: 'sandbag_wall', name: 'Sandbag wall', blurb: 'Stacked sandbags. Fast to raise and good for gun positions.', group: 'fences', w: 1, d: 1, price: 140, hp: 260, buildMinutes: 15, stock: 400, icon: 'Weight', barrier: true, look: { model: 'sandbags' } }),
  S({ id: 'wall_cinder', name: 'Cinder-block wall', blurb: 'A solid masonry wall. Blocks sight and sound.', group: 'fences', w: 1, d: 1, price: 520, hp: 700, buildMinutes: 60, stock: 250, icon: 'Blocks', barrier: true, look: { model: 'wall', variant: 'cinder', color: 0xa7a7a1 } }),
  S({ id: 'wall_concrete', name: 'Reinforced concrete wall', blurb: 'Thick poured concrete with a steel core. Very hard to break.', group: 'fences', w: 1, d: 1, price: 1100, hp: 1500, buildMinutes: 90, stock: 200, icon: 'Layers', barrier: true, look: { model: 'wall', variant: 'concrete', color: 0xb9b9b4 } }),
  S({ id: 'wall_steel', name: 'Steel plate wall', blurb: 'Welded steel plates. Expensive and nearly unbreakable.', group: 'fences', w: 1, d: 1, price: 1800, hp: 2000, buildMinutes: 80, stock: 150, icon: 'Cuboid', barrier: true, look: { model: 'wall', variant: 'steel', color: 0x6c7480 } }),
  S({ id: 'container_20', name: 'Shipping container, 20 ft', blurb: 'A 6 m steel box. Place a line of them for an instant, strong wall.', group: 'fences', w: 3, d: 1, price: 4800, hp: 2200, buildMinutes: 60, stock: 40, icon: 'Container', barrier: true, look: { model: 'container', variant: 'short', color: 0xb5482a } }),
  S({ id: 'container_40', name: 'Shipping container, 40 ft', blurb: 'A 12 m steel box. Covers twice the ground in one piece.', group: 'fences', w: 6, d: 1, price: 7900, hp: 2600, buildMinutes: 90, stock: 20, icon: 'Container', barrier: true, look: { model: 'container', variant: 'long', color: 0x2f5f8f } }),
  S({ id: 'gate_wood', name: 'Wooden gate', blurb: 'A 4 m double gate on a timber frame. Fine for a quiet farm.', group: 'fences', w: 2, d: 1, price: 420, hp: 220, buildMinutes: 35, stock: 60, icon: 'DoorClosed', barrier: true, look: { model: 'gate', variant: 'wood', color: 0x8a6b45 } }),
  S({ id: 'gate_chain', name: 'Chain-link gate', blurb: 'Matches a chain-link fence. Light and easy to swing.', group: 'fences', w: 2, d: 1, price: 600, hp: 300, buildMinutes: 35, stock: 60, icon: 'DoorClosed', barrier: true, look: { model: 'gate', variant: 'chain', color: 0x9aa3ab } }),
  S({ id: 'gate_steel', name: 'Reinforced steel gate', blurb: 'A heavy armored gate with a bolt. The strongest way in and out.', group: 'fences', w: 2, d: 1, price: 1600, hp: 900, buildMinutes: 60, stock: 40, icon: 'Shield', barrier: true, look: { model: 'gate', variant: 'steel', color: 0x4f5a66 } }),

  // ---- Houses and shelters
  S({ id: 'tent_large', name: 'Canvas family tent', blurb: 'Sleeps four. Ready in minutes but gives almost no protection.', group: 'houses', w: 2, d: 2, price: 450, hp: 80, buildMinutes: 15, stock: 40, icon: 'Tent', look: { model: 'tent', color: 0x6f7f4a } }),
  S({ id: 'prefab_home', name: 'Prefab container home', blurb: 'A fitted-out steel shelter with bunks and a stove. Quick to set up.', group: 'houses', w: 4, d: 2, price: 18000, hp: 1200, buildMinutes: 480, stock: 12, icon: 'Container', look: { model: 'house', variant: 'prefab', color: 0xc9c5ba, color2: 0x4f6a86 } }),
  S({ id: 'cabin_small', name: 'Log cabin', blurb: 'A snug two-bed cabin of stacked logs with a stone chimney.', group: 'houses', w: 3, d: 3, price: 12000, hp: 600, buildMinutes: 360, stock: 12, icon: 'House', look: { model: 'house', variant: 'cabin', color: 0x8b5e3c, color2: 0x4a3a2a } }),
  S({ id: 'house_family', name: 'Family house', blurb: 'A proper brick-and-timber house. Sleeps six in comfort.', group: 'houses', w: 4, d: 3, price: 28000, hp: 900, buildMinutes: 720, stock: 8, icon: 'House', look: { model: 'house', variant: 'family', color: 0xd9c9a8, color2: 0x7a3b2e } }),
  S({ id: 'house_large', name: 'Two-story house', blurb: 'Room for a whole community. Upper windows give a good view of the walls.', group: 'houses', w: 5, d: 4, price: 52000, hp: 1200, buildMinutes: 1200, stock: 4, icon: 'House', look: { model: 'house', variant: 'large', color: 0xcfd6d0, color2: 0x3e4a3a } }),
  S({ id: 'bunker', name: 'Underground bunker', blurb: 'Concrete shelter dug into the ground. Nearly impossible to break into.', group: 'houses', w: 3, d: 3, price: 38000, hp: 3000, buildMinutes: 900, stock: 3, icon: 'Shield', look: { model: 'bunker', color: 0x8a8c84 } }),

  // ---- Water
  S({ id: 'well_hand', name: 'Hand-pump well', blurb: 'A dug well with a hand pump. Slow, but it needs no power. Link it to a tank so the water is stored.', group: 'waterworks', w: 1, d: 1, price: 2400, hp: 150, buildMinutes: 240, stock: 24, icon: 'Droplet', look: { model: 'well', variant: 'hand' } }),
  S({ id: 'well_deep', name: 'Drilled deep well', blurb: 'An electric pump on a drilled borehole. Plenty of clean water, but it needs a power connection.', group: 'waterworks', w: 1, d: 1, price: 9500, hp: 250, buildMinutes: 480, stock: 8, icon: 'Droplet', look: { model: 'well', variant: 'deep' } }),
  S({ id: 'water_tank', name: 'Water tank, 1000 L', blurb: 'Stores a thousand liters of water.', group: 'waterworks', w: 1, d: 1, price: 680, hp: 120, buildMinutes: 40, stock: 60, icon: 'Cylinder', look: { model: 'tank', variant: 'small', color: 0x2f7fb8 } }),
  S({ id: 'water_tower', name: 'Water tower, 5000 L', blurb: 'A raised tank that feeds the base by gravity.', group: 'waterworks', w: 1, d: 1, price: 3200, hp: 300, buildMinutes: 180, stock: 12, icon: 'Cylinder', look: { model: 'tank', variant: 'tower', color: 0x6d8f4f } }),
  S({ id: 'pipe_post', name: 'Pipe junction', blurb: 'Buried pipe that joins wells, tanks and farms up to 14 m apart. Place one in between when they are too far away to connect.', group: 'waterworks', w: 1, d: 1, price: 95, hp: 80, buildMinutes: 15, stock: 200, icon: 'Cylinder', look: { model: 'pipe' } }),
  S({ id: 'rain_collector', name: 'Rain collector', blurb: 'Catches a little rainwater. Raw water: it needs a water filter in range to be safe to drink.', group: 'waterworks', w: 1, d: 1, price: 240, hp: 60, buildMinutes: 20, stock: 80, icon: 'CloudRain', look: { model: 'rain' } }),
  S({ id: 'water_filter', name: 'Water purification station', blurb: 'Cleans raw water from ponds and rain collectors so it is safe to drink. Needs a power connection and a water link to the source.', group: 'waterworks', w: 1, d: 1, price: 1350, hp: 100, buildMinutes: 90, stock: 20, icon: 'Pipette', look: { model: 'filter' } }),

  // ---- Power
  S({ id: 'solar_panel', name: 'Solar panel', blurb: 'A single panel on a tilting frame. Free power by day.', group: 'power', w: 1, d: 1, price: 320, hp: 60, buildMinutes: 25, stock: 120, icon: 'Sun', look: { model: 'solar', variant: 'single' } }),
  S({ id: 'solar_array', name: 'Solar array, 6 panels', blurb: 'Six panels wired together on a ground frame.', group: 'power', w: 2, d: 2, price: 1750, hp: 200, buildMinutes: 120, stock: 40, icon: 'Sun', look: { model: 'solar', variant: 'array' } }),
  S({ id: 'wind_turbine', name: 'Wind turbine', blurb: 'Works day and night when the wind blows. Tall and noticeable.', group: 'power', w: 1, d: 1, price: 4200, hp: 220, buildMinutes: 240, stock: 12, icon: 'Fan', look: { model: 'turbine' } }),
  S({ id: 'generator_5kw', name: 'Generator, 5 kW', blurb: 'Burns fuel when the base needs power. Needs gasoline or diesel in storage. Loud, so it draws zombies.', group: 'power', w: 1, d: 1, price: 1900, hp: 150, buildMinutes: 40, stock: 30, icon: 'Zap', look: { model: 'generator', variant: 'small', color: 0xd9a21c } }),
  S({ id: 'generator_10kw', name: 'Generator, 10 kW', blurb: 'Powers a whole base. Needs gasoline or diesel in storage. Even louder.', group: 'power', w: 1, d: 1, price: 3800, hp: 200, buildMinutes: 60, stock: 16, icon: 'PlugZap', look: { model: 'generator', variant: 'large', color: 0xc7392c } }),
  S({ id: 'battery_bank', name: 'Battery bank', blurb: 'Stores solar and wind power for the night. Holds 12 kWh.', group: 'power', w: 1, d: 1, price: 750, hp: 100, buildMinutes: 30, stock: 50, icon: 'BatteryFull', look: { model: 'battery' } }),
  S({ id: 'power_pole', name: 'Power pole', blurb: 'Carries electricity up to 14 m. Use it to link generators, solar panels and batteries to lamps, pumps and fences that are too far away.', group: 'power', w: 1, d: 1, price: 85, hp: 60, buildMinutes: 15, stock: 200, icon: 'Cable', look: { model: 'pole' } }),

  // ---- Farming
  S({ id: 'garden_bed', name: 'Raised garden bed', blurb: 'Grows vegetables. Needs vegetable seeds and a water connection: put it within 6 m of a tank or well, or within 14 m of a pipe junction.', group: 'farming', w: 2, d: 1, price: 180, hp: 40, buildMinutes: 25, stock: 120, icon: 'Sprout', look: { model: 'garden' } }),
  S({ id: 'greenhouse_kit', name: 'Greenhouse', blurb: 'Grows plenty of vegetables all year. Needs vegetable seeds and a water connection.', group: 'farming', w: 3, d: 2, price: 2400, hp: 140, buildMinutes: 180, stock: 20, icon: 'Flower', look: { model: 'greenhouse', variant: 'small' } }),
  S({ id: 'greenhouse_large', name: 'Large greenhouse', blurb: 'Twice the growing space, with a watering line that reaches 6 m. Needs vegetable seeds and water.', group: 'farming', w: 4, d: 3, price: 5800, hp: 200, buildMinutes: 300, stock: 8, icon: 'Flower', look: { model: 'greenhouse', variant: 'large' } }),
  S({ id: 'orchard_plot', name: 'Fruit orchard plot', blurb: 'Apple and pear trees. Slow to grow, then generous. Needs a water connection.', group: 'farming', w: 3, d: 3, price: 900, hp: 80, buildMinutes: 120, stock: 16, icon: 'Apple', look: { model: 'orchard' } }),
  S({ id: 'chicken_coop', name: 'Chicken coop', blurb: 'Fresh eggs and meat. Needs animal feed and a water connection.', group: 'farming', w: 2, d: 1, price: 520, hp: 90, buildMinutes: 60, stock: 30, icon: 'Bird', look: { model: 'coop' } }),
  S({ id: 'beehive', name: 'Beehive', blurb: 'A little honey now and then. Needs no care.', group: 'farming', w: 1, d: 1, price: 240, hp: 40, buildMinutes: 20, stock: 40, icon: 'Bug', look: { model: 'hive' } }),

  // ---- Defense
  S({ id: 'watchtower', name: 'Watchtower', blurb: 'A raised platform that shows threats early. A guard on top can shoot over the wall.', group: 'defense', w: 1, d: 1, price: 3600, hp: 500, buildMinutes: 200, stock: 20, icon: 'Binoculars', barrier: true, look: { model: 'tower' } }),
  S({ id: 'floodlight_tower', name: 'Floodlight tower', blurb: 'Lights up the perimeter at night. Needs a power connection.', group: 'defense', w: 1, d: 1, price: 1250, hp: 120, buildMinutes: 60, stock: 40, icon: 'Lightbulb', look: { model: 'floodlight' } }),
  S({ id: 'spike_strip', name: 'Spike trap', blurb: 'Rows of steel spikes. Hurts what walks over it.', group: 'defense', w: 1, d: 1, price: 300, hp: 100, buildMinutes: 20, stock: 200, icon: 'Triangle', look: { model: 'spikes' } }),
  S({ id: 'sandbag_nest', name: 'Sandbag gun nest', blurb: 'A curved wall of sandbags for two shooters.', group: 'defense', w: 2, d: 1, price: 600, hp: 340, buildMinutes: 35, stock: 60, icon: 'Crosshair', barrier: true, look: { model: 'sandbags', variant: 'nest' } }),
  S({ id: 'trench', name: 'Defensive trench', blurb: 'A deep ditch that slows the dead before the wall.', group: 'defense', w: 3, d: 1, price: 700, hp: 300, buildMinutes: 90, stock: 80, icon: 'Shovel', look: { model: 'trench' } }),

  // ---- Storage
  S({ id: 'crate_stack', name: 'Crate stack', blurb: 'Wooden crates for loose supplies.', group: 'storage', w: 1, d: 1, price: 150, hp: 60, buildMinutes: 10, stock: 100, icon: 'Boxes', look: { model: 'crates' } }),
  S({ id: 'shed_small', name: 'Tool shed', blurb: 'A lockable shed for tools and spare parts.', group: 'storage', w: 2, d: 2, price: 1800, hp: 180, buildMinutes: 120, stock: 30, icon: 'Warehouse', look: { model: 'shed' } }),
  S({ id: 'warehouse', name: 'Warehouse', blurb: 'Huge covered storage with a roll-up door.', group: 'storage', w: 5, d: 4, price: 24000, hp: 800, buildMinutes: 720, stock: 4, icon: 'Warehouse', look: { model: 'warehouse' } }),
  S({ id: 'fuel_tank', name: 'Fuel tank, 1000 L', blurb: 'A steel tank for gasoline or diesel.', group: 'storage', w: 1, d: 1, price: 1100, hp: 160, buildMinutes: 50, stock: 30, icon: 'Fuel', look: { model: 'fueltank' } }),

  // ---- Utility
  S({ id: 'lamp_post', name: 'Lamp post', blurb: 'Lights a small area at night. Needs a power connection: put it within 5 m of a generator, solar panel or battery, or within 14 m of a power pole.', group: 'utility', w: 1, d: 1, price: 210, hp: 40, buildMinutes: 15, stock: 150, icon: 'Lightbulb', look: { model: 'lamp' } }),
  S({ id: 'workbench', name: 'Workbench', blurb: 'Repair and craft at your base.', group: 'utility', w: 1, d: 1, price: 420, hp: 80, buildMinutes: 30, stock: 40, icon: 'Hammer', look: { model: 'workbench' } }),
  S({ id: 'outdoor_kitchen', name: 'Outdoor kitchen', blurb: 'A stove and prep table. Turns raw food into meals.', group: 'utility', w: 2, d: 1, price: 1600, hp: 100, buildMinutes: 90, stock: 20, icon: 'Utensils', look: { model: 'kitchen' } }),
  S({ id: 'bunk_beds', name: 'Bunk beds', blurb: 'Sleeping space for four.', group: 'utility', w: 2, d: 1, price: 380, hp: 60, buildMinutes: 30, stock: 60, icon: 'Bed', look: { model: 'bunk' } }),
  S({ id: 'medical_station', name: 'Medical station', blurb: 'A tent with beds and supplies for treating the sick and hurt.', group: 'utility', w: 2, d: 2, price: 2600, hp: 120, buildMinutes: 120, stock: 12, icon: 'Cross', look: { model: 'medical' } }),
  S({ id: 'radio_mast', name: 'Radio mast', blurb: 'Hears broadcasts from far away and can call for survivors.', group: 'utility', w: 1, d: 1, price: 2800, hp: 150, buildMinutes: 150, stock: 8, icon: 'RadioTower', look: { model: 'mast' } }),

  // ---- Ponds, trees, paths and garden features
  S({ id: 'pond_small', name: 'Small pond', blurb: 'A small pond with stones and reeds. Gives a little raw water, which needs a water filter in range.', group: 'landscape', w: 3, d: 3, price: 1200, hp: 100, buildMinutes: 180, stock: 30, icon: 'Waves', look: { model: 'pond', variant: 'small' } }),
  S({ id: 'pond_large', name: 'Large pond', blurb: 'A wide pond with lily pads. Gives raw water, which needs a powered water filter in range to be safe to drink.', group: 'landscape', w: 5, d: 4, price: 3800, hp: 100, buildMinutes: 420, stock: 12, icon: 'Waves', look: { model: 'pond', variant: 'large' } }),
  S({ id: 'pond_fish', name: 'Fish pond', blurb: 'A stocked pond that gives fresh fish and raw water. Raw water needs a water filter before it is safe to drink.', group: 'landscape', w: 4, d: 4, price: 4600, hp: 100, buildMinutes: 360, stock: 10, icon: 'Fish', look: { model: 'pond', variant: 'fish' } }),
  S({ id: 'tree_pine', name: 'Pine tree', blurb: 'An evergreen. Fast growing, and good cover from the road.', group: 'landscape', w: 1, d: 1, price: 90, hp: 60, buildMinutes: 10, stock: 400, icon: 'TreePine', look: { model: 'tree', variant: 'pine' } }),
  S({ id: 'tree_oak', name: 'Oak tree', blurb: 'A broad shade tree.', group: 'landscape', w: 1, d: 1, price: 110, hp: 80, buildMinutes: 10, stock: 400, icon: 'Trees', look: { model: 'tree', variant: 'oak' } }),
  S({ id: 'tree_apple', name: 'Apple tree', blurb: 'A little fruit now and then. Needs no care.', group: 'landscape', w: 1, d: 1, price: 160, hp: 60, buildMinutes: 12, stock: 300, icon: 'Apple', look: { model: 'tree', variant: 'apple' } }),
  S({ id: 'tree_birch', name: 'Birch tree', blurb: 'A slim white-barked tree with light leaves.', group: 'landscape', w: 1, d: 1, price: 100, hp: 50, buildMinutes: 10, stock: 300, icon: 'Leaf', look: { model: 'tree', variant: 'birch' } }),
  S({ id: 'hedge', name: 'Hedge', blurb: 'A dense green row that screens your land from view.', group: 'landscape', w: 1, d: 1, price: 60, hp: 80, buildMinutes: 8, stock: 500, icon: 'Leaf', look: { model: 'hedge' } }),
  S({ id: 'flower_bed', name: 'Flower bed', blurb: 'Colour for the garden and food for the bees.', group: 'landscape', w: 1, d: 1, price: 50, hp: 20, buildMinutes: 8, stock: 400, icon: 'Flower2', look: { model: 'flowers' } }),
  S({ id: 'path_gravel', name: 'Gravel path', blurb: 'A simple path of crushed stone. Drag to lay a long one.', group: 'landscape', w: 1, d: 1, price: 20, hp: 20, buildMinutes: 4, stock: 800, icon: 'Footprints', look: { model: 'path', variant: 'gravel' } }),
  S({ id: 'path_stone', name: 'Stone path', blurb: 'Flat cobbles set in the ground.', group: 'landscape', w: 1, d: 1, price: 45, hp: 30, buildMinutes: 6, stock: 800, icon: 'Footprints', look: { model: 'path', variant: 'stone' } }),
  S({ id: 'path_wood', name: 'Plank walkway', blurb: 'Wooden boards, good over wet ground.', group: 'landscape', w: 1, d: 1, price: 35, hp: 25, buildMinutes: 5, stock: 800, icon: 'Footprints', look: { model: 'path', variant: 'wood' } }),
  S({ id: 'fire_pit', name: 'Fire pit', blurb: 'A ring of stones for evening fires. Warm, bright and visible from afar.', group: 'landscape', w: 1, d: 1, price: 240, hp: 60, buildMinutes: 25, stock: 100, icon: 'Flame', look: { model: 'firepit' } }),
  S({ id: 'bench', name: 'Garden bench', blurb: 'A wooden bench to sit and watch the wall.', group: 'landscape', w: 1, d: 1, price: 140, hp: 50, buildMinutes: 10, stock: 200, icon: 'Armchair', look: { model: 'bench' } }),
  S({ id: 'picnic_table', name: 'Picnic table', blurb: 'A table with two benches for shared meals.', group: 'landscape', w: 2, d: 1, price: 260, hp: 70, buildMinutes: 20, stock: 120, icon: 'Armchair', look: { model: 'picnic' } }),
  S({ id: 'flag_pole', name: 'Flag pole', blurb: 'Show who lives here.', group: 'landscape', w: 1, d: 1, price: 120, hp: 40, buildMinutes: 12, stock: 100, icon: 'Flag', look: { model: 'flagpole' } }),
  S({ id: 'boulder', name: 'Boulder', blurb: 'A large rock for the garden or to narrow a path.', group: 'landscape', w: 1, d: 1, price: 80, hp: 400, buildMinutes: 15, stock: 200, icon: 'Mountain', look: { model: 'boulder' } }),

  // ---- More for farms and storage
  S({ id: 'scarecrow', name: 'Scarecrow', blurb: 'Keeps the crows off your crops.', group: 'farming', w: 1, d: 1, price: 70, hp: 30, buildMinutes: 10, stock: 150, icon: 'Wheat', look: { model: 'scarecrow' } }),
  S({ id: 'barn', name: 'Barn', blurb: 'A big red barn for animals, hay and machines.', group: 'farming', w: 5, d: 4, price: 14500, hp: 700, buildMinutes: 600, stock: 6, icon: 'Warehouse', look: { model: 'barn' } }),
  S({ id: 'windmill', name: 'Windmill pump', blurb: 'A traditional windmill that pumps water from the ground without power.', group: 'waterworks', w: 2, d: 2, price: 5200, hp: 250, buildMinutes: 300, stock: 10, icon: 'Fan', look: { model: 'windmill' } }),
  S({ id: 'garage', name: 'Garage', blurb: 'Covered space for a truck and its fuel.', group: 'storage', w: 3, d: 3, price: 9800, hp: 600, buildMinutes: 420, stock: 8, icon: 'Car', look: { model: 'garage' } }),
];

export const STRUCTURES: Record<string, StructureDef> = Object.fromEntries(STRUCTURE_LIST.map((s) => [s.id, s]));

export function isStructure(itemId: string): boolean {
  return itemId in STRUCTURES;
}

export function structureById(id: string): StructureDef {
  const s = STRUCTURES[id];
  if (!s) throw new Error(`Unknown structure "${id}"`);
  return s;
}

/** Footprint after rotation. Rotation is 0 to 3 quarter turns. */
export function footprint(def: StructureDef, rot: number): { w: number; d: number } {
  return rot % 2 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

/**
 * Hedges join up with neighbouring hedges. They stand inside a tile, so they work on whole cells.
 */
export function isLineStructure(def: StructureDef | undefined): boolean {
  return !!def && def.look.model === 'hedge';
}

/**
 * Fences, walls, sandbag walls and gates are EDGE pieces: they stand on the line between two tiles, not inside one.
 * A piece's (cx, cz) is the start of its line segment on the grid: with an even rotation it runs along x on the line
 * z = cz, from x = cx; with an odd rotation it runs along z on the line x = cx, from z = cz.
 */
export function isEdgeStructure(def: StructureDef | undefined): boolean {
  return !!def && ['fence', 'wall', 'gate'].includes(def.look.model) || (!!def && def.look.model === 'sandbags' && def.look.variant !== 'nest');
}

/** How many tiles long an edge piece is (a gate spans two). */
export function edgeLength(def: StructureDef): number {
  return def.w;
}

/** Bits that say which end posts an edge piece draws: the start (at cx, cz) and the end. */
export const POST_START = 1;
export const POST_END = 2;

/** Bits that say which neighbouring cells a hedge joins: +x, -x, +z, -z. */
export const LINK_PX = 1;
export const LINK_NX = 2;
export const LINK_PZ = 4;
export const LINK_NZ = 8;

/**
 * Where a piece stands, in meters measured from the grid corner: its center and size. Cell pieces fill their tiles.
 * Edge pieces lie along a grid line.
 */
export function gridRectOf(def: StructureDef, cx: number, cz: number, rot: number): { x: number; z: number; w: number; d: number } {
  if (isEdgeStructure(def)) {
    const len = edgeLength(def) * CELL;
    const thickness = 0.5;
    if (rot % 2 === 0) return { x: cx * CELL + len / 2, z: cz * CELL, w: len, d: thickness };
    return { x: cx * CELL, z: cz * CELL + len / 2, w: thickness, d: len };
  }
  const fp = footprint(def, rot);
  return { x: (cx + fp.w / 2) * CELL, z: (cz + fp.d / 2) * CELL, w: fp.w * CELL, d: fp.d * CELL };
}