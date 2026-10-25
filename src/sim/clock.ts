import { DAY, HOUR } from '../data/balance';

/** Day number starting at 1. */
export function dayOf(worldSeconds: number): number {
  return Math.floor(worldSeconds / DAY) + 1;
}

/** Hours since midnight, 0 to 24. */
export function hourOf(worldSeconds: number): number {
  return (worldSeconds % DAY) / HOUR;
}

export function formatClock(worldSeconds: number): string {
  const h = hourOf(worldSeconds);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** World seconds for the start of a given day (1-based) at a given hour. */
export function worldSecondsAt(day: number, hour: number): number {
  return (day - 1) * DAY + hour * HOUR;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How bright the day is: 0 in the dead of night, 1 at full daylight, with a long twilight between. */
export function daylight(hour: number): number {
  const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  return smoothstep(-0.34, 0.28, elev);
}

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 7.5) return 'dawn';
  if (hour >= 7.5 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19.5) return 'dusk';
  return 'night';
}