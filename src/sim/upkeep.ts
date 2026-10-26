import { itemById } from '../data/items';
import { STRUCTURES } from '../data/structures';
import {
  DIRTY_ABOVE, MATERIAL_MIX, MAX_UPGRADE, REPAIR_COST_SHARE, REPAIR_TOOL, UPGRADE_OUTPUT_PER_LEVEL, UPGRADE_STRENGTH_PER_LEVEL,
  UPGRADE_TOOL, UPGRADE_WEAR_RELIEF_PER_LEVEL, WORN_BELOW, upkeepOf,
} from '../data/upkeep';
import { addMessage } from './messages';
import type { GameState, Piece } from './state';
import { runtimeOf, type Issue } from './utilities';

const DAY_SECONDS = 86400;

export const levelOf = (p: Piece): number => p.upgrade ?? 0;
export const dirtOf = (p: Piece): number => p.dirt ?? 0;
/** Share of full strength left, 0 to 1. */
export const strengthOf = (p: Piece): number => (p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 1);

/** Full strength of a structure at an upgrade level. */
export function maxHpFor(type: string, level: number): number {
  return Math.round(STRUCTURES[type].hp * (1 + UPGRADE_STRENGTH_PER_LEVEL * level));
}

/** Machines run at full output while they are in fair shape, then fade to 30% as they fall apart. */
export function conditionFactor(piece: Piece): number {
  const r = strengthOf(piece);
  return r >= 0.5 ? 1 : 0.3 + 1.4 * r;
}

/** Dirt costs up to 70% of the output, once it passes 30%. */
export function dirtPenalty(dirt: number): number {
  return dirt <= 0.3 ? 0 : ((dirt - 0.3) / 0.7) * 0.7;
}

/** How well a machine, farm or water source works compared with a new one. Upgrades raise it above 1. */
export function outputFactor(piece: Piece): number {
  if (!upkeepOf(piece.type)) return 1;
  return conditionFactor(piece) * (1 + UPGRADE_OUTPUT_PER_LEVEL * levelOf(piece)) * (1 - dirtPenalty(dirtOf(piece)));
}

/** Wear everything down a little for the game time that passed. */
export function stepUpkeep(state: GameState, worldDt: number): void {
  const days = worldDt / DAY_SECONDS;
  if (days <= 0 || runtimeOf(state).cheats.noWear) return;
  for (const p of state.pieces) {
    if (p.progress < 1) continue;
    const spec = upkeepOf(p.type);
    if (!spec) continue;
    if (spec.wear > 0) {
      const wear = spec.wear * (1 - UPGRADE_WEAR_RELIEF_PER_LEVEL * levelOf(p));
      p.hp = Math.max(p.maxHp * 0.03, p.hp - p.maxHp * wear * days);
    }
    if (spec.dirtDays) p.dirt = Math.min(1, dirtOf(p) + days / spec.dirtDays);
  }
}

/** The one thing most worth fixing on a structure, if it needs fixing. */
export function conditionIssue(piece: Piece): Issue | null {
  if (piece.progress < 1) return null;
  const spec = upkeepOf(piece.type);
  if (!spec) return null;
  const name = STRUCTURES[piece.type].name;
  if (strengthOf(piece) < WORN_BELOW) {
    return {
      kind: 'repair', code: 'worn',
      text: `${name} is badly worn (${Math.round(strengthOf(piece) * 100)}% strength). Click it and repair it with a toolbox and materials.`,
    };
  }
  if (spec.dirtDays && dirtOf(piece) > DIRTY_ABOVE) {
    return {
      kind: 'clean', code: 'dirty',
      text: `${name} is dirty and works at ${Math.round(outputFactor(piece) * 100)}%. Click it and clean it.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------- Jobs: repair, upgrade, clean

export interface WorkQuote {
  /** Whether the job can be done right now. */
  ok: boolean;
  /** Why not, when it cannot. */
  reason?: string;
  /** Materials that are used up. */
  items: Record<string, number>;
  /** Tools that are needed but kept. */
  tools: string[];
  /** What it does, in a few words. */
  effect?: string;
}

export type WorkResult = { ok: true; message: string } | { ok: false; reason: string };

/** Materials worth about this many dollars, split the way the material class needs. */
function materialsWorth(type: string, dollars: number): Record<string, number> {
  const spec = upkeepOf(type)!;
  const items: Record<string, number> = {};
  for (const [item, share] of MATERIAL_MIX[spec.material]) {
    items[item] = Math.max(1, Math.ceil((dollars * share) / itemById(item).price));
  }
  return items;
}

/** What is missing to do a job, as a sentence, or null if everything is at hand. */
function shortage(state: GameState, items: Record<string, number>, tools: string[]): string | null {
  if (state.at !== 'base') return 'Walk to your base first.';
  if (runtimeOf(state).cheats.freeWork) return null;
  for (const tool of tools) {
    if ((state.storage[tool] ?? 0) < 1) return `You need a ${itemById(tool).name.toLowerCase()} in storage.`;
  }
  for (const [item, qty] of Object.entries(items)) {
    const have = state.storage[item] ?? 0;
    if (have < qty) return `You need ${qty - have} more ${itemById(item).name.toLowerCase()}.`;
  }
  return null;
}

function spend(state: GameState, items: Record<string, number>): void {
  if (runtimeOf(state).cheats.freeWork) return;
  for (const [item, qty] of Object.entries(items)) {
    state.storage[item] = (state.storage[item] ?? 0) - qty;
    if (state.storage[item] <= 0) delete state.storage[item];
  }
}

export function repairQuote(state: GameState, piece: Piece): WorkQuote {
  const spec = upkeepOf(piece.type);
  if (!spec) return { ok: false, reason: 'This never wears out.', items: {}, tools: [] };
  if (piece.progress < 1) return { ok: false, reason: 'It is not built yet.', items: {}, tools: [] };
  const missing = 1 - strengthOf(piece);
  if (missing < 0.02) return { ok: false, reason: 'It is in perfect shape.', items: {}, tools: [] };
  const price = STRUCTURES[piece.type].price * (1 + 0.5 * levelOf(piece));
  const items = materialsWorth(piece.type, price * REPAIR_COST_SHARE * missing);
  const tools = [REPAIR_TOOL];
  const reason = shortage(state, items, tools);
  return { ok: reason === null, reason: reason ?? undefined, items, tools, effect: `Back to full strength (+${Math.round(missing * 100)}%)` };
}

export function repairPiece(state: GameState, id: number): WorkResult {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece) return { ok: false, reason: 'That is gone.' };
  const q = repairQuote(state, piece);
  if (!q.ok) return { ok: false, reason: q.reason ?? 'It cannot be repaired.' };
  spend(state, q.items);
  piece.hp = piece.maxHp;
  return { ok: true, message: `${STRUCTURES[piece.type].name} repaired.` };
}

export function upgradeQuote(state: GameState, piece: Piece): WorkQuote {
  const spec = upkeepOf(piece.type);
  if (!spec) return { ok: false, reason: 'This cannot be upgraded.', items: {}, tools: [] };
  if (piece.progress < 1) return { ok: false, reason: 'It is not built yet.', items: {}, tools: [] };
  const level = levelOf(piece);
  if (level >= MAX_UPGRADE) return { ok: false, reason: 'Fully upgraded.', items: {}, tools: [] };
  const price = STRUCTURES[piece.type].price * (0.3 + 0.2 * level);
  const items = materialsWorth(piece.type, price);
  const tools = [UPGRADE_TOOL[spec.material]];
  const reason = shortage(state, items, tools);
  const gain = Math.round(UPGRADE_STRENGTH_PER_LEVEL * 100);
  return {
    ok: reason === null, reason: reason ?? undefined, items, tools,
    effect: `Level ${level + 1}: +${gain}% strength, +${Math.round(UPGRADE_OUTPUT_PER_LEVEL * 100)}% output, slower wear`,
  };
}

export function upgradePiece(state: GameState, id: number): WorkResult {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece) return { ok: false, reason: 'That is gone.' };
  const q = upgradeQuote(state, piece);
  if (!q.ok) return { ok: false, reason: q.reason ?? 'It cannot be upgraded.' };
  spend(state, q.items);
  const level = levelOf(piece) + 1;
  const max = maxHpFor(piece.type, level);
  piece.hp += max - piece.maxHp;
  piece.maxHp = max;
  piece.upgrade = level;
  return { ok: true, message: `${STRUCTURES[piece.type].name} upgraded to level ${level}.` };
}

export function cleanQuote(state: GameState, piece: Piece): WorkQuote {
  const spec = upkeepOf(piece.type);
  if (!spec?.dirtDays) return { ok: false, reason: 'It stays clean by itself.', items: {}, tools: [] };
  if (piece.progress < 1) return { ok: false, reason: 'It is not built yet.', items: {}, tools: [] };
  if (dirtOf(piece) < 0.05) return { ok: false, reason: 'It is already clean.', items: {}, tools: [] };
  const items = { ...(spec.clean?.use ?? {}) };
  const tools = spec.clean?.tool ? [spec.clean.tool] : [];
  const reason = shortage(state, items, tools);
  return { ok: reason === null, reason: reason ?? undefined, items, tools, effect: 'Back to full output' };
}

export function cleanPiece(state: GameState, id: number): WorkResult {
  const piece = state.pieces.find((p) => p.id === id);
  if (!piece) return { ok: false, reason: 'That is gone.' };
  const q = cleanQuote(state, piece);
  if (!q.ok) return { ok: false, reason: q.reason ?? 'It cannot be cleaned.' };
  spend(state, q.items);
  piece.dirt = 0;
  return { ok: true, message: `${STRUCTURES[piece.type].name} cleaned.` };
}

/**
 * Taking down a worn structure only gives back scrap, so it cannot be used to get a free repair. A structure in good
 * shape goes back to storage whole. Returns the materials given, or null if it went back whole.
 */
export function salvageOf(piece: Piece): Record<string, number> | null {
  if (strengthOf(piece) >= 0.9 || !upkeepOf(piece.type)) return null;
  const dollars = STRUCTURES[piece.type].price * 0.25 * strengthOf(piece);
  return materialsWorth(piece.type, Math.max(dollars, 1));
}

export function noteSalvage(state: GameState, piece: Piece, items: Record<string, number>): void {
  for (const [item, qty] of Object.entries(items)) state.storage[item] = (state.storage[item] ?? 0) + qty;
  const list = Object.entries(items).map(([item, qty]) => `${qty} ${itemById(item).name.toLowerCase()}`).join(', ');
  addMessage(state, `The ${STRUCTURES[piece.type].name.toLowerCase()} was too worn to reuse. You kept ${list}.`, 'info');
}
