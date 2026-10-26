/**
 * Every vehicle you can buy and every part that can be fitted to one. A vehicle is bought as a store item (so it uses the
 * same shops, prices and panic rules as everything else) and turns into a real vehicle standing on the map.
 */

export type VehicleId = 'bicycle' | 'scooter' | 'sedan' | 'pickup' | 'van' | 'suv' | 'truck';
export type FuelKind = 'none' | 'petrol' | 'diesel';

export interface VehicleDef {
  id: VehicleId;
  /** The store item that buys it. */
  item: string;
  name: string;
  blurb: string;
  fuel: FuelKind;
  /** Fuel tank size in liters. */
  tank: number;
  /** Liters burned per kilometre. */
  burn: number;
  /** Top speed on a road, in meters per second. */
  topSpeed: number;
  /** Meters per second gained each second at full throttle. */
  accel: number;
  /** How sharply it turns at low speed, in radians per second. */
  turn: number;
  /** Hit points. Crashes wear them down; at zero it will not start. */
  durability: number;
  /** What it carries, in kilograms. */
  cargo: number;
  seats: number;
  /** 0 (silent) to 1 (very loud). Loud vehicles will draw zombies. */
  noise: number;
  /** Share of its road speed it keeps on open ground (0 to 1). */
  offroad: number;
  /** Heaviest trailer it can pull, in kilograms. Zero means it cannot tow. */
  tow: number;
  /** Footprint in meters (width, length), for crashes and parking. */
  width: number;
  length: number;
  colors: number[];
}

export const VEHICLE_LIST: VehicleDef[] = [
  {
    id: 'bicycle', item: 'bicycle', name: 'Bicycle', blurb: 'Silent and needs no fuel. Slow, and it carries very little.',
    fuel: 'none', tank: 0, burn: 0, topSpeed: 7, accel: 2.2, turn: 2.6, durability: 60, cargo: 12, seats: 1, noise: 0, offroad: 0.85, tow: 0,
    width: 0.7, length: 1.8, colors: [0x3a6fb0, 0xb0392f, 0x3f8f4f],
  },
  {
    id: 'scooter', item: 'scooter', name: 'Scooter', blurb: 'Quick and thrifty with fuel. Small tank, small load, and it can be heard.',
    fuel: 'petrol', tank: 7, burn: 0.3, topSpeed: 15, accel: 4, turn: 2.6, durability: 90, cargo: 25, seats: 2, noise: 0.55, offroad: 0.6, tow: 0,
    width: 0.8, length: 1.9, colors: [0xd9d9d9, 0xc2362b, 0x2d3a4a],
  },
  {
    id: 'sedan', item: 'sedan', name: 'Sedan', blurb: 'Fast on the road and easy to drive. Poor on rough ground and it cannot tow.',
    fuel: 'petrol', tank: 50, burn: 1.5, topSpeed: 28, accel: 6, turn: 2.0, durability: 220, cargo: 90, seats: 5, noise: 0.5, offroad: 0.35, tow: 0,
    width: 1.9, length: 4.4, colors: [0xb23a32, 0x3b5f9a, 0xd9d9d9, 0x2e3033, 0xc9a43a],
  },
  {
    id: 'pickup', item: 'pickup_truck', name: 'Pickup truck', blurb: 'A tough all-rounder with an open bed. Tows a trailer and copes with rough ground.',
    fuel: 'petrol', tank: 80, burn: 2.2, topSpeed: 26, accel: 5, turn: 1.8, durability: 320, cargo: 450, seats: 3, noise: 0.65, offroad: 0.7, tow: 1500,
    width: 1.95, length: 5.0, colors: [0x4c7c59, 0xe07a2f, 0x5b8fa8, 0xd9d9d9],
  },
  {
    id: 'van', item: 'cargo_van', name: 'Cargo van', blurb: 'A big closed load space on diesel. Roomy and steady, not quick.',
    fuel: 'diesel', tank: 70, burn: 2.0, topSpeed: 24, accel: 4, turn: 1.6, durability: 260, cargo: 700, seats: 3, noise: 0.6, offroad: 0.45, tow: 1000,
    width: 2.0, length: 4.8, colors: [0xe8e8e8, 0x3b5f9a, 0xc9a43a],
  },
  {
    id: 'suv', item: 'suv', name: 'SUV', blurb: 'Fast, sturdy and happy off the road. Takes five people and a little cargo.',
    fuel: 'petrol', tank: 75, burn: 2.6, topSpeed: 29, accel: 5.5, turn: 1.9, durability: 380, cargo: 220, seats: 5, noise: 0.65, offroad: 0.85, tow: 1500,
    width: 2.0, length: 4.7, colors: [0x2e3033, 0x8a4f9e, 0x4c7c59, 0xd9d9d9],
  },
  {
    id: 'truck', item: 'box_truck', name: 'Box truck', blurb: 'Hauls a huge load and pulls the heaviest trailers. Slow, thirsty and very loud.',
    fuel: 'diesel', tank: 200, burn: 4.5, topSpeed: 19, accel: 3, turn: 1.2, durability: 600, cargo: 2000, seats: 3, noise: 0.85, offroad: 0.6, tow: 5000,
    width: 2.4, length: 7.0, colors: [0xe8e8e8, 0xb23a32, 0x3b5f9a],
  },
];

export const VEHICLES = Object.fromEntries(VEHICLE_LIST.map((v) => [v.id, v])) as Record<VehicleId, VehicleDef>;

/** The vehicle a store item buys, or undefined if the item is not a vehicle. */
export function vehicleForItem(itemId: string): VehicleDef | undefined {
  return VEHICLE_LIST.find((v) => v.item === itemId);
}

export type AttachmentId = 'trailer' | 'roof_rack' | 'bull_bar' | 'extra_tank' | 'tow_hitch';

export interface AttachmentDef {
  id: AttachmentId;
  /** Both the store item and the thing kept in storage while it is not fitted. */
  item: string;
  name: string;
  blurb: string;
  /** Which vehicles it fits. */
  fits: VehicleId[];
  /** Extra load in kilograms. */
  cargo?: number;
  /** Extra fuel tank in liters. */
  tank?: number;
  /** Crash damage is multiplied by this. */
  crash?: number;
  /** Another part that must be fitted first. */
  requires?: AttachmentId;
  /** Trailers weigh this much (kg) and slow the climb to top speed. */
  weight?: number;
}

const MOTORS: VehicleId[] = ['sedan', 'pickup', 'van', 'suv', 'truck'];
const TOWERS: VehicleId[] = ['pickup', 'van', 'suv', 'truck'];

export const ATTACHMENT_LIST: AttachmentDef[] = [
  { id: 'tow_hitch', item: 'tow_hitch', name: 'Tow hitch', blurb: 'Lets a vehicle pull a trailer.', fits: TOWERS },
  { id: 'trailer', item: 'trailer', name: 'Utility trailer', blurb: 'Adds a big open load space. Slows you down a little and needs a tow hitch.', fits: TOWERS, cargo: 600, requires: 'tow_hitch', weight: 700 },
  { id: 'roof_rack', item: 'roof_rack', name: 'Roof rack', blurb: 'Room for more on the roof.', fits: ['sedan', 'pickup', 'van', 'suv'], cargo: 80 },
  { id: 'bull_bar', item: 'bull_bar', name: 'Bull bar', blurb: 'A steel guard on the front. Crashes do half the damage.', fits: MOTORS, crash: 0.5 },
  { id: 'extra_tank', item: 'extra_tank', name: 'Extra fuel tank', blurb: 'Adds 30 liters of range.', fits: MOTORS, tank: 30 },
];

export const ATTACHMENTS = Object.fromEntries(ATTACHMENT_LIST.map((a) => [a.id, a])) as Record<AttachmentId, AttachmentDef>;

export function attachmentForItem(itemId: string): AttachmentDef | undefined {
  return ATTACHMENT_LIST.find((a) => a.item === itemId);
}

/** The part used to mend vehicles: one box repairs this many hit points. */
export const SPARE_PARTS_ITEM = 'spare_parts';
export const PARTS_HP = 30;

/** What a vehicle is really worth with its parts fitted. */
export function effective(def: VehicleDef, fitted: readonly string[]): { tank: number; cargo: number; crash: number; trailer: boolean } {
  let tank = def.tank;
  let cargo = def.cargo;
  let crash = 1;
  let trailer = false;
  for (const id of fitted) {
    const a = ATTACHMENTS[id as AttachmentId];
    if (!a) continue;
    tank += a.tank ?? 0;
    cargo += a.cargo ?? 0;
    crash *= a.crash ?? 1;
    if (a.id === 'trailer') trailer = true;
  }
  return { tank, cargo, crash, trailer };
}
