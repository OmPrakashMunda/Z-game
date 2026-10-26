import { balance } from '../data/balance';
import { advanceConstruction } from './build';
import { dayOf } from './clock';
import { dailyRestock, processDeliveries, refundPendingOrders } from './economy';
import { addMessage } from './messages';
import type { GameState } from './state';
import { stepExposure } from './exposure';
import { stepSearch } from './loot';
import { stepSurvival } from './survival';
import { stepUpkeep } from './upkeep';

/**
 * Advance the simulation by one fixed step.
 * @param _realDt real seconds (for real-time systems such as zombies, added later)
 * @param worldDt game seconds (real seconds multiplied by the time scale)
 */
export function stepSim(state: GameState, _realDt: number, worldDt: number): void {
  if (state.phase === 'dead') return;

  const prevDay = dayOf(state.worldSeconds);
  state.worldSeconds += worldDt;
  const day = dayOf(state.worldSeconds);

  for (let d = prevDay + 1; d <= day; d++) dailyRestock(state);

  advanceConstruction(state, worldDt);
  stepUpkeep(state, worldDt);
  stepSurvival(state, worldDt);
  stepExposure(state, worldDt);
  stepSearch(state, worldDt);

  // Deliveries that are due arrive before the shops close.
  processDeliveries(state);

  if (state.phase === 'prep' && day >= balance.outbreakDay) startOutbreak(state);
}

function startOutbreak(state: GameState): void {
  state.phase = 'outbreak';
  refundPendingOrders(state);
  addMessage(
    state,
    'THE OUTBREAK HAS BEGUN. The shops are closed and the streets are no longer safe. Whatever you built and stored is all you have.',
    'warning',
  );
}
