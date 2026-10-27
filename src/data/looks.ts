/**
 * How a survivor can look. A look is a handful of choices (an index into each list below), so it is small to save and easy
 * to check. The walking character and the character preview both read these tables.
 */

export type Gender = 'male' | 'female';
export type HairStyle = 'short' | 'long' | 'bald';

export interface Look {
  /** Index into SKIN_TONES. */
  skin: number;
  /** Index into HAIR_COLORS. Ignored for a bald head. */
  hair: number;
  hairStyle: HairStyle;
  /** Index into SHIRT_COLORS. */
  shirt: number;
}

export const SKIN_TONES: readonly number[] = [0xf6d5b8, 0xf0c9a0, 0xc68b5e, 0x8d5a3b, 0x5e3a25];
export const HAIR_COLORS: readonly number[] = [0x1c1410, 0x4a3320, 0x7a4a24, 0xb98a3e, 0xb9b4a8, 0xa8402a];
export const SHIRT_COLORS: readonly number[] = [0x2f6fb3, 0xc2507f, 0x3f8f4f, 0xc9a43a, 0xb23a32, 0x6b4aa0, 0x2e3033, 0xd9d9d9];

export const SKIN_NAMES = ['Light', 'Fair', 'Tan', 'Brown', 'Dark'];
export const HAIR_NAMES = ['Black', 'Brown', 'Auburn', 'Blond', 'Grey', 'Red'];
export const SHIRT_NAMES = ['Blue', 'Pink', 'Green', 'Yellow', 'Red', 'Purple', 'Charcoal', 'White'];
export const HAIR_STYLES: ReadonlyArray<{ id: HairStyle; label: string }> = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'bald', label: 'Bald' },
];

/** The look a new survivor starts with. */
export function defaultLook(gender: Gender): Look {
  return gender === 'female' ? { skin: 1, hair: 0, hairStyle: 'long', shirt: 1 } : { skin: 1, hair: 1, hairStyle: 'short', shirt: 0 };
}

const index = (v: unknown, size: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < size ? v : fallback;

/** A look made safe: anything missing or out of range falls back to the default for that gender. */
export function cleanLook(raw: unknown, gender: Gender): Look {
  const d = defaultLook(gender);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Look, unknown>>;
  const style = HAIR_STYLES.some((s) => s.id === r.hairStyle) ? (r.hairStyle as HairStyle) : d.hairStyle;
  return {
    skin: index(r.skin, SKIN_TONES.length, d.skin),
    hair: index(r.hair, HAIR_COLORS.length, d.hair),
    hairStyle: style,
    shirt: index(r.shirt, SHIRT_COLORS.length, d.shirt),
  };
}

/** Names offered by the dice button. */
export const SURVIVOR_NAMES: Record<Gender, string[]> = {
  male: ['Alex', 'Sam', 'Jack', 'Leo', 'Noah', 'Ben', 'Max', 'Ryan', 'Owen', 'Eli'],
  female: ['Alex', 'Mia', 'Emma', 'Zoe', 'Lily', 'Ava', 'Nora', 'Ella', 'Ruby', 'Iris'],
};
