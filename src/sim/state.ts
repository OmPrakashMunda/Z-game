import { balance } from '../data/balance';
import type { LocationId, PlotId } from '../data/city';
import { STORES, type StoreId } from '../data/stores';
import { worldSecondsAt } from './clock';
import { startPosition } from './places';
import { starterOutfit, type Outfit } from '../data/clothing';
import type { OwnedVehicle } from './vehicles';

export type Phase = 'prep' | 'outbreak' | 'dead';

export type Gender = 'male' | 'female';

/** Who the player is. Chosen when a game starts. */
export interface Character {
  name: string;
  gender: Gender;
}

export function defaultCharacter(): Character {
  return { name: 'Alex', gender: 'male' };
}

/**
 * Where the player is, worked out from where they stand: at a shop's door, at their base (on or just beside their land),
 * or 'outside'. 'base' exists once a plot has been bought.
 */
export type PlaceId = LocationId | 'base' | 'outside';

/** Where the player stands on the map, in meters, and the way they face (0 faces +z, the way the shop doors face). */
export interface Position {
  x: number;
  z: number;
  heading: number;
}

export interface PlayerState {
  health: number;
  hunger: number;
  thirst: number;
  fatigue: number;
}

export type OrderStatus = 'transit' | 'delivered' | 'refunded';

export interface Order {
  id: number;
  storeId: StoreId;
  items: Record<string, number>;
  subtotal: number;
  fee: number;
  total: number;
  placedAt: number;
  deliverAt: number;
  status: OrderStatus;
}

export type MessageKind = 'info' | 'news' | 'order' | 'warning';

export interface Message {
  id: number;
  worldSeconds: number;
  text: string;
  kind: MessageKind;
}

/** A structure placed on the base plot. */
export interface Piece {
  id: number;
  /** Structure id, for example 'fence_wood'. */
  type: string;
  /** Grid cell of the corner with the lowest x and z, counted from the plot's corner. */
  cx: number;
  cz: number;
  /** Quarter turns, 0 to 3. */
  rot: number;
  hp: number;
  maxHp: number;
  /** 0 while it is only a plan, 1 when finished. */
  progress: number;
  /** Upgrade level, 0 to 3. Absent means 0. */
  upgrade?: number;
  /** How dirty a pond, panel or greenhouse is, 0 (clean) to 1. Absent means clean. */
  dirt?: number;
  /** Stored energy of a battery (kWh) or water in a tank (liters). */
  level?: number;
  /** How far a farm is through its growing cycle, 0 to 1. Zero means it is waiting for seeds or feed. */
  growth?: number;
}

/** Everything the survival rules remember between steps. */
export interface SurvivalState {
  /** Meals, liters of water and liters of fuel that have been opened but not used up yet. */
  mealBuffer: number;
  waterBuffer: number;
  fuelBuffer: number;
  /** Meals harvested since the last daily report. */
  harvestMeals: number;
  /** The day the last harvest report was sent. */
  harvestReportDay: number;
  /** Whether the move-in supplies have been handed over. */
  starterGiven: boolean;
  /** When each kind of alert was last sent, so the same warning is not repeated. */
  notices: Record<string, number>;
}

/** How many 10 m strips of extra land have been bought on each side of the plot. */
export interface Expansion {
  /** Toward -z */
  n: number;
  /** Toward +x */
  e: number;
  /** Toward +z */
  s: number;
  /** Toward -x */
  w: number;
}

export interface GameState {
  version: number;
  worldSeconds: number;
  rngSeed: number;
  phase: Phase;
  money: number;
  /** Worked out from pos every frame. Saved only so older code that reads it keeps working. */
  at: PlaceId;
  /** Where the player stands. */
  pos: Position;
  character: Character;
  /** What the character wears, by slot. Not drawn; it changes how the weather hurts. */
  outfit: Outfit;
  /** How soaked the character is, 0 to 1. */
  wet: number;
  /** Days added to the calendar by the SETSEASON cheat. */
  calendarShift: number;
  plotId: PlotId | null;
  expansion: Expansion;
  player: PlayerState;
  /** What the player carries on their back, by item id. Emptied into storage at the base. */
  pack: Record<string, number>;
  /** Houses that have been searched, by house id: the day, and any goods that did not fit and were left behind. */
  looted: Record<string, { day: number; left: Record<string, number> }>;
  /** The vehicles the player owns, wherever they are parked. */
  vehicles: OwnedVehicle[];
  /** The vehicle being driven, if any. */
  driving: number | null;
  /** Supplies and unplaced structures kept in storage. */
  storage: Record<string, number>;
  /** Structures placed on the base plot. */
  pieces: Piece[];
  survival: SurvivalState;
  /** Current stock per store, per item. */
  stores: Record<string, Record<string, number>>;
  orders: Order[];
  messages: Message[];
  /** Last day for which the Director has been asked for events. */
  directedDay: number;
  nextId: number;
}

/** Bump when the shape of GameState changes. Older saves are filled in by save/store.ts. */
export const SAVE_VERSION = 9;

export function initialSurvival(): SurvivalState {
  return {
    mealBuffer: 0,
    waterBuffer: 0,
    fuelBuffer: 0,
    harvestMeals: 0,
    harvestReportDay: 0,
    starterGiven: false,
    notices: {},
  };
}

export function initialStoreStock(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const store of Object.values(STORES)) {
    out[store!.id] = Object.fromEntries(store!.stock);
  }
  return out;
}

export function createNewGame(seed = Date.now() % 2_147_483_647, character: Character = defaultCharacter()): GameState {
  const start = worldSecondsAt(balance.startDay, balance.startHour);
  return {
    version: SAVE_VERSION,
    worldSeconds: start,
    rngSeed: seed,
    phase: 'prep',
    money: balance.startingMoney,
    at: 'motel',
    pos: startPosition(),
    character: { name: character.name, gender: character.gender },
    outfit: starterOutfit(),
    wet: 0,
    calendarShift: 0,
    plotId: null,
    expansion: { n: 0, e: 0, s: 0, w: 0 },
    player: { health: 100, hunger: 100, thirst: 100, fatigue: 100 },
    pack: {},
    looted: {},
    vehicles: [],
    driving: null,
    storage: {},
    pieces: [],
    survival: initialSurvival(),
    stores: initialStoreStock(),
    orders: [],
    messages: [
      {
        id: 1,
        worldSeconds: start,
        kind: 'info',
        text: 'You have 30 days. Buy a base plot at Hillside Realty, then order supplies and build your defenses before the outbreak begins.',
      },
    ],
    directedDay: balance.startDay,
    nextId: 2,
  };
}
