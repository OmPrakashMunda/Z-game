import type { Phase } from '../sim/state';
import { addMessage } from '../sim/messages';
import type { GameState } from '../sim/state';

/**
 * The Director produces world events. Today it is rule-based. A Gemini-backed Director can implement the
 * same interface later. Whatever a Director returns is validated before it touches the game.
 */
export type EventKind = 'news' | 'warning';

export interface GameEvent {
  kind: EventKind;
  text: string;
}

export interface WorldSummary {
  day: number;
  phase: Phase;
  hasPlot: boolean;
  money: number;
}

export interface Director {
  nextEvents(summary: WorldSummary): Promise<GameEvent[]>;
}

const NEWS: Record<number, GameEvent[]> = {
  3: [{ kind: 'news', text: 'Radio: Health officials report an unusual fever spreading through the northern provinces. They say there is no cause for alarm.' }],
  8: [{ kind: 'news', text: 'Radio: Hospitals in the capital report overcrowding. Officials deny any link to the northern fever.' }],
  12: [{ kind: 'news', text: 'Online videos show sick people attacking others. Authorities call them hoaxes.' }],
  16: [{ kind: 'news', text: 'Airlines cancel flights to three countries. Travelers are being screened at every border.' }],
  19: [{ kind: 'news', text: 'The army quarantines two cities. Stores report rising demand for canned food and water.' }],
  20: [{ kind: 'warning', text: 'Panic buying has started. Shelves are emptying and prices are climbing every day.' }],
  23: [{ kind: 'news', text: 'Fuel stations limit sales to 20 liters per customer. Pharmacies report shortages of antibiotics.' }],
  25: [{ kind: 'news', text: 'Emergency broadcast: Stay home. Avoid contact with anyone who is sick. More information to follow.' }],
  27: [{ kind: 'news', text: 'Two TV channels have stopped broadcasting. Stores are rationing what is left.' }],
  29: [{ kind: 'warning', text: 'State of emergency declared. A curfew begins tomorrow and all roads out of town are closed.' }],
};

export class RuleBasedDirector implements Director {
  async nextEvents(summary: WorldSummary): Promise<GameEvent[]> {
    const events: GameEvent[] = [...(NEWS[summary.day] ?? [])];
    if (summary.day >= 2 && summary.day < 20 && !summary.hasPlot && summary.day % 3 === 0) {
      events.push({ kind: 'warning', text: 'Reminder: you still have no base. Visit Hillside Realty before prices and stock get worse.' });
    }
    return events;
  }
}

/** Accept only well-formed events with sane lengths, whatever produced them. */
export function validateEvents(raw: unknown): GameEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: GameEvent[] = [];
  for (const e of raw.slice(0, 5)) {
    if (!e || typeof e !== 'object') continue;
    const { kind, text } = e as Partial<GameEvent>;
    if ((kind !== 'news' && kind !== 'warning') || typeof text !== 'string') continue;
    const clean = text.trim().slice(0, 240);
    if (clean) out.push({ kind, text: clean });
  }
  return out;
}

export function applyEvents(state: GameState, events: GameEvent[]): void {
  for (const e of events) addMessage(state, e.text, e.kind);
}
