import { runtimeOf } from './utilities';
import type { GameState } from './state';

/**
 * Seasons and weather. Nothing here is stored: both are plain functions of the game's seed and the world clock, so the
 * picture, the sound and the rules always agree, a save needs nothing extra, and the same game has the same weather.
 *
 * A year is four seasons of 20 game days (80 days), so the seasons turn slowly: the 30 days of preparation cover one season
 * and a half. Weather comes in spells of several hours that build up and fade away smoothly.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_DAYS = 20;
export const YEAR_DAYS = SEASON_DAYS * 4;
export const SEASON_NAMES: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export type Anomaly = 'heatwave' | 'coldsnap' | null;

export interface Weather {
  season: Season;
  /** Where we are in the year, 0 (first day of spring) up to 1. */
  yearPhase: number;
  /** Air temperature in degrees Celsius. */
  temp: number;
  /** How hard it rains, 0 to 1. */
  rain: number;
  /** How hard it snows, 0 to 1. */
  snow: number;
  /** How violent the storm is, 0 to 1. Thunder and lightning come with it. */
  storm: number;
  /** How overcast it is, 0 to 1. */
  cloud: number;
  /** 0 (calm) to 1 (gale). */
  wind: number;
  anomaly: Anomaly;
  /** How strong the heatwave or cold snap is, 0 to 1. */
  anomalyLevel: number;
  /** A short phrase for the top bar. */
  label: string;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash(i: number, seed: number): number {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth random numbers over time: the same x always gives the same value, 0 to 1. */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - s) + hash(i + 1, seed) * s;
}

/** Which day of the 80-day year a new game starts on. It begins early in a season of the seed's choosing. */
export function startDayOfYear(seed: number): number {
  return Math.floor(hash(1, seed) * 4) * SEASON_DAYS + 3;
}

/** Value that glides from one season's number to the next, hitting each at the middle of its season. */
function bySeason(values: readonly [number, number, number, number], phase: number): number {
  const p = phase * 4 - 0.5;
  const i = Math.floor(p);
  const f = p - i;
  const a = values[((i % 4) + 4) % 4];
  const b = values[(((i + 1) % 4) + 4) % 4];
  const s = (1 - Math.cos(f * Math.PI)) / 2;
  return a + (b - a) * s;
}
export { bySeason };

/** The calendar: season and year phase at a moment. `shift` is days added by the SETSEASON cheat. */
export function calendarAt(seed: number, worldSeconds: number, shift = 0): { season: Season; yearPhase: number; seasonT: number } {
  const days = worldSeconds / 86400 + startDayOfYear(seed) + shift;
  const inYear = ((days % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  const yearPhase = inYear / YEAR_DAYS;
  const idx = Math.floor(inYear / SEASON_DAYS) % 4;
  return { season: SEASONS[idx], yearPhase, seasonT: (inYear % SEASON_DAYS) / SEASON_DAYS };
}

export function weatherAt(seed: number, worldSeconds: number, shift = 0): Weather {
  const cal = calendarAt(seed, worldSeconds, shift);
  const hours = worldSeconds / 3600;
  const days = worldSeconds / 86400 + shift;
  const hourOfDay = ((hours % 24) + 24) % 24;
  const s = seed % 100000;

  // Spells of rain: long smooth swells, more or less common with the season
  const rainSwell = noise1(hours / 16 + s * 0.37, 11);
  const rainThreshold = bySeason([0.66, 0.76, 0.62, 0.66], cal.yearPhase);
  const wet = smooth(rainThreshold, rainThreshold + 0.2, rainSwell);
  const stormKind = bySeason([0.55, 0.85, 0.7, 0.45], cal.yearPhase);
  const stormSwell = noise1(hours / 9 + s * 0.11, 97);
  const storm = wet > 0.35 ? smooth(0.56, 0.8, stormSwell) * stormKind * smooth(0.35, 0.7, wet) : 0;

  // Temperature: a slow yearly curve, a daily rise and fall, and a little drifting noise
  const mean = 11 + 14 * Math.cos(2 * Math.PI * (cal.yearPhase - 0.375));
  const daily = 5 * Math.sin(((hourOfDay - 9) / 24) * 2 * Math.PI);
  const drift = (noise1(hours / 20 + s * 0.2, 5) - 0.5) * 5;

  // Calamities that last for days: heatwaves in summer, cold snaps in winter and late autumn
  const heatWeight = bySeason([0.1, 1, 0.15, 0], cal.yearPhase);
  const coldWeight = bySeason([0.05, 0, 0.35, 1], cal.yearPhase);
  const heat = smooth(0.55, 0.95, noise1(days / 5 + s * 0.3, 300)) * heatWeight;
  const cold = smooth(0.55, 0.95, noise1(days / 5 + s * 0.3, 700)) * coldWeight;
  const anomalyLevel = Math.max(heat, cold);
  const anomaly: Anomaly = anomalyLevel > 0.4 ? (heat >= cold ? 'heatwave' : 'coldsnap') : null;

  let temp = mean + daily + drift + heat * 8 - cold * 9 - wet * 3 - storm * 2;
  const snowing = temp < 1.5;
  const rain = snowing ? 0 : wet;
  const snow = snowing ? wet : 0;
  const cloud = clamp(0.2 + 0.45 * noise1(hours / 30 + s * 0.05, 55) + 0.6 * Math.max(wet, storm));
  const wind = clamp(0.12 + 0.3 * noise1(hours / 7 + s * 0.4, 7) + 0.55 * storm);
  temp = Math.round(temp * 10) / 10;

  return { season: cal.season, yearPhase: cal.yearPhase, temp, rain, snow, storm, cloud, wind, anomaly, anomalyLevel, label: describe(rain, snow, storm, cloud, anomaly) };
}

function describe(rain: number, snow: number, storm: number, cloud: number, anomaly: Anomaly): string {
  if (storm > 0.5) return snow > 0.1 ? 'Blizzard' : 'Thunderstorm';
  if (storm > 0.2 && rain > 0.2) return 'Stormy';
  if (rain > 0.6) return 'Heavy rain';
  if (rain > 0.12) return 'Rain';
  if (snow > 0.6) return 'Heavy snow';
  if (snow > 0.12) return 'Snow';
  if (anomaly === 'heatwave') return 'Heatwave';
  if (anomaly === 'coldsnap') return 'Cold snap';
  if (cloud > 0.62) return 'Overcast';
  if (cloud > 0.4) return 'Cloudy';
  return 'Clear';
}

/** The weather the game is using right now: the real one, unless a cheat or a test has taken over. */
export function currentWeather(state: GameState): Weather {
  const rt = runtimeOf(state);
  const real = weatherAt(state.rngSeed, state.worldSeconds, state.calendarShift);
  const o = rt.weatherOverride;
  if (!o) return real;
  const w = { ...real, ...o };
  w.label = describe(w.rain, w.snow, w.storm, w.cloud, w.anomaly);
  return w;
}

/** How much of the ground is under snow, 0 to 1: it settles when the days stay cold and melts as they warm. */
export function snowCover(w: Weather): number {
  const meanLike = 11 + 14 * Math.cos(2 * Math.PI * (w.yearPhase - 0.375));
  return clamp(smooth(3, -4, meanLike) + w.snow * 0.25);
}
