import type { PlotId } from '../data/city';
import type { Slot } from '../data/clothing';
import type { StoreId } from '../data/stores';
import { buildPlan, planBase, type BuildPlanResult } from './architect';
import { movePiece, placePiece, removePiece, rotatePiece, type BuildResult } from './build';
import { loadFromStorage, unloadToStorage } from './cargo';
import { grantFunds, placeOrder, returnItems, SANDBOX_FUNDS, type Cart, type OrderResult } from './economy';
import { expandPlot, type Side } from './land';
import { cancelSearch, startSearch, takeLeftovers } from './loot';
import { takeOff, wear } from './outfit';
import { buyPlot } from './realty';
import type { GameState } from './state';
import { cleanPiece, repairPiece, upgradePiece, type WorkResult } from './upkeep';
import {
  enterVehicle, exitVehicle, fitPart, refuelAtPump, refuelFromCans, removePart, repairVehicle,
} from './vehicles';
import type { AttachmentId } from '../data/vehicles';

/**
 * Everything a player can do to the game, as plain data. The game runs a command with `applyCommand`; a server will receive the
 * same commands from its players and run them in the same way. Each command wraps one rule from this folder and gives back the
 * rule's own answer, so what a player sees (a toast, a sound, a redraw) is decided by the caller from that answer.
 *
 * Commands act for the player whose view is on the state: where they stand (`state.at`), what they carry, what they wear and
 * the vehicle they drive. Walking and driving are not commands: they are continuous input.
 */
export type Command =
  // Money and land
  | { type: 'order'; storeId: StoreId; cart: Cart }
  | { type: 'buyPlot'; plotId: PlotId }
  | { type: 'expand'; side: Side }
  | { type: 'returnItems'; itemId: string; qty: number }
  | { type: 'funds' }
  // Building
  | { type: 'place'; piece: string; cx: number; cz: number; rot: number }
  | { type: 'move'; id: number; cx: number; cz: number; rot: number }
  | { type: 'rotate'; id: number }
  | { type: 'remove'; id: number }
  | { type: 'work'; job: 'repair' | 'upgrade' | 'clean'; id: number }
  | { type: 'architect' }
  // Clothes
  | { type: 'wear'; item: string }
  | { type: 'takeOff'; slot: Slot }
  // Vehicles
  | { type: 'enterVehicle'; vehicleId: number }
  | { type: 'exitVehicle' }
  | { type: 'cargo'; kind: 'load' | 'unload' | 'all'; vehicleId: number; item: string; qty: number }
  /** job is 'cans', 'pump', 'repair', 'fit:<part>' or 'remove:<part>'. */
  | { type: 'vehicleJob'; job: string; vehicleId: number }
  // Houses
  | { type: 'search'; houseId: string }
  | { type: 'takeLeftovers'; houseId: string }
  | { type: 'cancelSearch' };

export type CommandType = Command['type'];

export interface CommandResults {
  order: OrderResult;
  buyPlot: ReturnType<typeof buyPlot>;
  expand: ReturnType<typeof expandPlot>;
  returnItems: ReturnType<typeof returnItems>;
  funds: { ok: true; amount: number };
  place: BuildResult;
  move: ReturnType<typeof movePiece>;
  rotate: ReturnType<typeof rotatePiece>;
  remove: ReturnType<typeof removePiece>;
  work: WorkResult;
  architect: BuildPlanResult | { ok: false; reason: string };
  wear: ReturnType<typeof wear>;
  takeOff: ReturnType<typeof takeOff>;
  enterVehicle: ReturnType<typeof enterVehicle>;
  exitVehicle: ReturnType<typeof exitVehicle>;
  cargo: { moved: number };
  vehicleJob: { ok: true; message: string } | { ok: false; reason: string };
  search: ReturnType<typeof startSearch>;
  takeLeftovers: ReturnType<typeof takeLeftovers>;
  cancelSearch: { ok: true };
}

const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Run a vehicle job (fuel, repair, fit or remove a part) and say what was done. */
function vehicleJob(state: GameState, job: string, vehicleId: number): CommandResults['vehicleJob'] {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  if (!v) return { ok: false, reason: 'That vehicle is gone.' };
  if (job === 'cans') {
    const r = refuelFromCans(state, v);
    return r.ok ? { ok: true, message: `Added ${Math.round(r.liters)} L of fuel.` } : r;
  }
  if (job === 'pump') {
    const r = refuelAtPump(state, v);
    return r.ok ? { ok: true, message: `Added ${Math.round(r.liters)} L for ${dollars(r.cost)}.` } : r;
  }
  if (job === 'repair') {
    const r = repairVehicle(state, v);
    return r.ok ? { ok: true, message: `Repaired ${Math.round(r.restored)} hit points${r.used ? ` with ${r.used} spare part${r.used === 1 ? '' : 's'}` : ''}.` } : r;
  }
  if (job.startsWith('fit:') || job.startsWith('remove:')) {
    const fitting = job.startsWith('fit:');
    const part = job.split(':')[1] as AttachmentId;
    const r = fitting ? fitPart(state, v, part) : removePart(state, v, part);
    return r.ok ? { ok: true, message: fitting ? 'Fitted.' : 'Removed. It is back in your storage.' } : r;
  }
  return { ok: false, reason: 'Nothing to do.' };
}

/** Carry out one command for the player whose view is on the state. */
export function applyCommand<C extends Command>(state: GameState, cmd: C): CommandResults[C['type']];
export function applyCommand(state: GameState, cmd: Command): unknown {
  switch (cmd.type) {
    case 'order':
      return placeOrder(state, cmd.storeId, cmd.cart);
    case 'buyPlot':
      return buyPlot(state, cmd.plotId);
    case 'expand':
      return expandPlot(state, cmd.side);
    case 'returnItems':
      return returnItems(state, cmd.itemId, cmd.qty);
    case 'funds':
      grantFunds(state);
      return { ok: true, amount: SANDBOX_FUNDS };
    case 'place':
      return placePiece(state, cmd.piece, cmd.cx, cmd.cz, cmd.rot);
    case 'move':
      return movePiece(state, cmd.id, cmd.cx, cmd.cz, cmd.rot);
    case 'rotate':
      return rotatePiece(state, cmd.id);
    case 'remove':
      return removePiece(state, cmd.id);
    case 'work':
      return cmd.job === 'repair' ? repairPiece(state, cmd.id) : cmd.job === 'upgrade' ? upgradePiece(state, cmd.id) : cleanPiece(state, cmd.id);
    case 'architect': {
      // The plan is worked out here from the state, so a player cannot send one of their own
      const plan = planBase(state);
      return plan ? buildPlan(state, plan) : { ok: false, reason: 'The shops have closed.' };
    }
    case 'wear':
      return wear(state, cmd.item);
    case 'takeOff':
      return takeOff(state, cmd.slot);
    case 'enterVehicle':
      return enterVehicle(state, cmd.vehicleId);
    case 'exitVehicle':
      return exitVehicle(state);
    case 'cargo': {
      const v = state.vehicles.find((x) => x.id === cmd.vehicleId);
      if (!v) return { moved: 0 };
      if (cmd.kind === 'load') return { moved: loadFromStorage(state, v, cmd.item, cmd.qty) };
      if (cmd.kind === 'unload') return { moved: unloadToStorage(state, v, cmd.item, cmd.qty) };
      let moved = 0;
      for (const [item, qty] of Object.entries({ ...v.cargo })) moved += unloadToStorage(state, v, item, qty);
      return { moved };
    }
    case 'vehicleJob':
      return vehicleJob(state, cmd.job, cmd.vehicleId);
    case 'search':
      return startSearch(state, cmd.houseId);
    case 'takeLeftovers':
      return takeLeftovers(state, cmd.houseId);
    case 'cancelSearch':
      cancelSearch(state);
      return { ok: true };
  }
}
