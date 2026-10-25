import { city, type PlotId } from '../data/city';
import { addMessage } from './messages';
import type { GameState } from './state';

export function plotProblem(state: GameState, plotId: PlotId): string | null {
  const plot = city.plots.find((p) => p.id === plotId);
  if (!plot) return 'That plot does not exist.';
  if (state.phase !== 'prep') return 'The realty office has closed.';
  if (state.at !== 'real_estate') return 'You need to be at Hillside Realty to buy land.';
  if (state.plotId) return 'You already own a plot.';
  if (plot.price > state.money) return `You need $${(plot.price - state.money).toLocaleString('en-US')} more.`;
  return null;
}

export function buyPlot(state: GameState, plotId: PlotId): { ok: true } | { ok: false; reason: string } {
  const problem = plotProblem(state, plotId);
  if (problem) return { ok: false, reason: problem };
  const plot = city.plots.find((p) => p.id === plotId)!;
  state.money -= plot.price;
  state.plotId = plotId;
  addMessage(
    state,
    `You bought ${plot.name} for $${plot.price.toLocaleString('en-US')}. You can now order supplies and have them delivered to your base.`,
    'info',
  );
  return { ok: true };
}
