import { STRUCTURES, type StructureDef } from './structures';

/**
 * Wear and upkeep. Everything you build slowly gets worn down. Walls and fences lose strength, machines lose output,
 * and ponds, panels and greenhouse glass get dirty. Repairs and upgrades use materials from the shops (and, later,
 * from supply runs); the tools are kept, only the materials are used up.
 */

/** What a thing is made of decides which materials it takes to repair or upgrade. */
export type MaterialClass = 'wood' | 'masonry' | 'metal' | 'electric' | 'sand';

export interface UpkeepSpec {
  /** Share of full strength lost per day. */
  wear: number;
  material: MaterialClass;
  /** Days for it to go from clean to fully dirty. Absent for things that stay clean. */
  dirtDays?: number;
  /** What it takes to clean it: a tool you keep, and supplies that are used up. */
  clean?: { tool?: string; use?: Record<string, number> };
}

/** Repair and upgrade materials for each class: how the money is split between items. */
export const MATERIAL_MIX: Record<MaterialClass, Array<[string, number]>> = {
  wood: [['lumber', 0.7], ['nails', 0.3]],
  masonry: [['concrete', 1]],
  metal: [['steel_sheet', 0.65], ['screws', 0.35]],
  electric: [['wire_spool', 0.6], ['screws', 0.4]],
  sand: [['sandbags', 1]],
};

/** The tool each class of work needs. Repairs always need a toolbox; upgrades need a power tool or a welder. */
export const REPAIR_TOOL = 'toolbox';
export const UPGRADE_TOOL: Record<MaterialClass, string> = {
  wood: 'power_tools', masonry: 'power_tools', sand: 'power_tools', metal: 'welding_kit', electric: 'welding_kit',
};

/** A full repair costs about this share of the price of the thing. */
export const REPAIR_COST_SHARE = 0.18;
/** The most levels a structure can be upgraded. Each adds strength, output and slower wear. */
export const MAX_UPGRADE = 3;
export const UPGRADE_STRENGTH_PER_LEVEL = 0.35;
export const UPGRADE_OUTPUT_PER_LEVEL = 0.15;
export const UPGRADE_WEAR_RELIEF_PER_LEVEL = 0.15;

/** Below this share of full strength the game calls a structure badly worn. */
export const WORN_BELOW = 0.4;
/** Above this level of dirt the game asks for a cleaning. */
export const DIRTY_ABOVE = 0.6;

type Row = [number, MaterialClass, number?, UpkeepSpec['clean']?];

// model[:variant] -> [wear per day, material, days to get dirty, cleaning]
const SHOVEL = { tool: 'shovel' } as const;
const SOAP = { use: { soap: 1 } } as const;
const BY_LOOK: Record<string, Row> = {
  'fence:picket': [0.008, 'wood'],
  'fence:chain': [0.004, 'metal'],
  'fence:barbed': [0.004, 'metal'],
  'fence:electric': [0.006, 'electric'],
  'fence:palisade': [0.006, 'wood'],
  sandbags: [0.008, 'sand'],
  'wall:cinder': [0.002, 'masonry'],
  'wall:concrete': [0.0012, 'masonry'],
  'wall:steel': [0.0015, 'metal'],
  container: [0.001, 'metal'],
  'gate:wood': [0.007, 'wood'],
  'gate:chain': [0.005, 'metal'],
  'gate:steel': [0.003, 'metal'],
  tent: [0.02, 'wood'],
  'house:prefab': [0.002, 'metal'],
  'house:cabin': [0.004, 'wood'],
  'house:family': [0.003, 'masonry'],
  'house:large': [0.003, 'masonry'],
  bunker: [0.0008, 'masonry'],
  'well:hand': [0.005, 'metal'],
  'well:deep': [0.007, 'metal'],
  tank: [0.003, 'metal'],
  pipe: [0.002, 'metal'],
  rain: [0.006, 'metal', 20, SOAP],
  filter: [0.008, 'metal'],
  solar: [0.003, 'electric', 14, SOAP],
  turbine: [0.008, 'electric'],
  generator: [0.01, 'electric'],
  battery: [0.006, 'electric'],
  pole: [0.004, 'electric'],
  garden: [0.008, 'wood'],
  greenhouse: [0.006, 'metal', 30, SOAP],
  coop: [0.01, 'wood'],
  hive: [0.005, 'wood'],
  tower: [0.003, 'wood'],
  floodlight: [0.006, 'electric'],
  spikes: [0.004, 'metal'],
  trench: [0.005, 'masonry'],
  crates: [0.004, 'wood'],
  shed: [0.004, 'wood'],
  warehouse: [0.002, 'masonry'],
  fueltank: [0.003, 'metal'],
  lamp: [0.006, 'electric'],
  workbench: [0.006, 'wood'],
  kitchen: [0.008, 'metal'],
  bunk: [0.004, 'wood'],
  medical: [0.005, 'wood'],
  mast: [0.004, 'metal'],
  barn: [0.003, 'wood'],
  windmill: [0.007, 'wood'],
  garage: [0.002, 'masonry'],
  'pond:small': [0, 'masonry', 12, SHOVEL],
  'pond:large': [0, 'masonry', 16, SHOVEL],
  'pond:fish': [0, 'masonry', 10, SHOVEL],
  bench: [0.004, 'wood'],
  picnic: [0.004, 'wood'],
  flagpole: [0.004, 'metal'],
  scarecrow: [0.01, 'wood'],
};

const cache = new Map<string, UpkeepSpec | null>();

/** How a structure wears, or null if it never does (paths, trees, flowers, boulders and the like). */
export function upkeepOf(type: string): UpkeepSpec | null {
  if (cache.has(type)) return cache.get(type)!;
  const def: StructureDef | undefined = STRUCTURES[type];
  let spec: UpkeepSpec | null = null;
  if (def) {
    const look = def.look;
    const row = BY_LOOK[`${look.model}:${look.variant ?? ''}`] ?? BY_LOOK[look.model];
    if (row) {
      const [wear, material, dirtDays, clean] = row;
      spec = { wear, material, dirtDays, clean: clean as UpkeepSpec['clean'] };
    }
  }
  cache.set(type, spec);
  return spec;
}
