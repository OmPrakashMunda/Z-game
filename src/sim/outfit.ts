import { CLOTHING, isClothing, SLOT_NAMES, type Slot } from '../data/clothing';
import { itemById } from '../data/items';
import type { GameState } from './state';

/** Putting clothes on and taking them off. Clothes come from your backpack, or from storage when you are at your base. */

/** The clothes within reach: carried, plus everything in storage at the base. */
export function wearableOnHand(state: GameState): Array<{ id: string; slot: Slot; count: number; carried: number }> {
  const out: Array<{ id: string; slot: Slot; count: number; carried: number }> = [];
  for (const id of Object.keys(CLOTHING)) {
    const carried = state.pack[id] ?? 0;
    const stored = state.at === 'base' ? state.storage[id] ?? 0 : 0;
    if (carried + stored > 0) out.push({ id, slot: CLOTHING[id].slot, count: carried + stored, carried });
  }
  return out;
}

function giveBack(state: GameState, id: string): void {
  // What you take off goes in the backpack, or into storage at the base
  if (state.at === 'base') state.storage[id] = (state.storage[id] ?? 0) + 1;
  else state.pack[id] = (state.pack[id] ?? 0) + 1;
}

export function wear(state: GameState, id: string): { ok: true } | { ok: false; reason: string } {
  if (!isClothing(id)) return { ok: false, reason: 'That cannot be worn.' };
  const slot = CLOTHING[id].slot;
  if ((state.pack[id] ?? 0) > 0) {
    state.pack[id] -= 1;
    if (state.pack[id] <= 0) delete state.pack[id];
  } else if (state.at === 'base' && (state.storage[id] ?? 0) > 0) {
    state.storage[id] -= 1;
  } else {
    return { ok: false, reason: `You do not have ${itemById(id).name.toLowerCase()} with you. Get it from storage at your base.` };
  }
  const old = state.outfit[slot];
  state.outfit[slot] = id;
  if (old) giveBack(state, old);
  return { ok: true };
}

export function takeOff(state: GameState, slot: Slot): { ok: true } | { ok: false; reason: string } {
  const old = state.outfit[slot];
  if (!old) return { ok: false, reason: `You are wearing nothing on your ${SLOT_NAMES[slot].toLowerCase()}.` };
  state.outfit[slot] = null;
  giveBack(state, old);
  return { ok: true };
}
