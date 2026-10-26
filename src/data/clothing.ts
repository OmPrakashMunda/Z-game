/**
 * Clothes. They are not drawn on the character: they matter through two numbers, shown in the character panel and on the
 * product sheets. Warmth keeps the cold out, and dryness keeps the rain off.
 */

export type Slot = 'head' | 'body' | 'legs' | 'hands' | 'feet';
export const SLOTS: readonly Slot[] = ['head', 'body', 'legs', 'hands', 'feet'];
export const SLOT_NAMES: Record<Slot, string> = { head: 'Head', body: 'Body', legs: 'Legs', hands: 'Hands', feet: 'Feet' };
export const SLOT_ICONS: Record<Slot, string> = { head: 'HardHat', body: 'Shirt', legs: 'Ruler', hands: 'Hand', feet: 'Footprints' };

/** How much each part of the body counts toward the total. */
export const SLOT_SHARE: Record<Slot, number> = { head: 0.15, body: 0.4, legs: 0.2, hands: 0.1, feet: 0.15 };

export interface ClothingDef {
  slot: Slot;
  /** 0 to 1: keeps the cold out. A very warm piece is too hot in a heatwave. */
  warmth: number;
  /** 0 to 1: keeps the rain and snow off. */
  dry: number;
}

export const CLOTHING: Record<string, ClothingDef> = {
  baseball_cap: { slot: 'head', warmth: 0.05, dry: 0.1 },
  wool_beanie: { slot: 'head', warmth: 0.5, dry: 0.1 },
  rain_hat: { slot: 'head', warmth: 0.1, dry: 0.7 },
  tshirt: { slot: 'body', warmth: 0.08, dry: 0.02 },
  hoodie: { slot: 'body', warmth: 0.35, dry: 0.08 },
  jacket: { slot: 'body', warmth: 0.5, dry: 0.3 },
  raincoat: { slot: 'body', warmth: 0.2, dry: 0.85 },
  parka: { slot: 'body', warmth: 0.9, dry: 0.6 },
  jeans: { slot: 'legs', warmth: 0.25, dry: 0.08 },
  cargo_pants: { slot: 'legs', warmth: 0.3, dry: 0.15 },
  rain_pants: { slot: 'legs', warmth: 0.15, dry: 0.8 },
  thermal_pants: { slot: 'legs', warmth: 0.75, dry: 0.15 },
  work_gloves: { slot: 'hands', warmth: 0.2, dry: 0.15 },
  winter_gloves: { slot: 'hands', warmth: 0.8, dry: 0.35 },
  sneakers: { slot: 'feet', warmth: 0.1, dry: 0.08 },
  hiking_boots: { slot: 'feet', warmth: 0.35, dry: 0.6 },
  rubber_boots: { slot: 'feet', warmth: 0.15, dry: 0.9 },
  winter_boots: { slot: 'feet', warmth: 0.85, dry: 0.7 },
};

export type Outfit = Record<Slot, string | null>;

/** What a new character wears: a t-shirt, jeans and sneakers. */
export function starterOutfit(): Outfit {
  return { head: null, body: 'tshirt', legs: 'jeans', hands: null, feet: 'sneakers' };
}

export function isClothing(itemId: string): boolean {
  return itemId in CLOTHING;
}

/** The warmth and dryness of a whole outfit, 0 to 1 each. */
export function outfitStats(outfit: Outfit): { warmth: number; dry: number } {
  let warmth = 0;
  let dry = 0;
  for (const slot of SLOTS) {
    const def = CLOTHING[outfit[slot] ?? ''];
    if (!def) continue;
    warmth += def.warmth * SLOT_SHARE[slot];
    dry += def.dry * SLOT_SHARE[slot];
  }
  return { warmth, dry };
}
