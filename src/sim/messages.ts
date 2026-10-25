import type { GameState, MessageKind } from './state';

const MAX_MESSAGES = 120;

export function addMessage(state: GameState, text: string, kind: MessageKind = 'info'): void {
  state.messages.push({ id: state.nextId++, worldSeconds: state.worldSeconds, text, kind });
  if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
}
