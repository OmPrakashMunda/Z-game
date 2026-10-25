import { balance } from './data/balance';

const DEFAULT_TIME_SCALE = 24;

function parseTimeScale(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    console.warn(`VITE_TIME_SCALE is not set. Using ${DEFAULT_TIME_SCALE}.`);
    return DEFAULT_TIME_SCALE;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`VITE_TIME_SCALE="${String(raw)}" is invalid. Using ${DEFAULT_TIME_SCALE}.`);
    return DEFAULT_TIME_SCALE;
  }
  return n;
}

export const config = {
  /** World clock multiplier. Applies to the world clock only, never to movement or combat. */
  timeScale: parseTimeScale(import.meta.env.VITE_TIME_SCALE),
  balance,
};

/** Dev-only: change the speed while playing from the browser console: `__setTimeScale(48)`. */
export function setTimeScale(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    console.warn('Time scale must be a number greater than 0.');
    return;
  }
  config.timeScale = value;
  console.info(`Time scale set to ${value}x (until reload).`);
}
