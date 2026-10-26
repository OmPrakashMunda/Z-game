import { outfitStats } from '../data/clothing';
import { addMessage } from './messages';
import type { GameState } from './state';
import { runtimeOf } from './utilities';
import { SEASON_NAMES, SEASONS, calendarAt, currentWeather, weatherAt, type Weather } from './weather';

/**
 * What the weather does to the player. Out in the open, rain soaks you and slowly takes your health, cold and heat wear you
 * down, and lightning can strike. Indoors (at your base, at a shop door, or in a closed vehicle) you are safe. Clothes change
 * all of it: dry clothes keep the rain off, warm clothes keep the cold out.
 */

const HOUR = 3600;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Vehicles with a roof and doors. A bicycle or scooter leaves you in the weather. */
const CLOSED = new Set(['sedan', 'pickup', 'van', 'suv', 'truck']);

/** Whether the player is under cover right now. */
export function sheltered(state: GameState): boolean {
  if (state.driving !== null) {
    const v = state.vehicles.find((x) => x.id === state.driving);
    return !!v && CLOSED.has(v.type);
  }
  return state.at !== 'outside';
}

export interface Exposure {
  sheltered: boolean;
  /** 0 to 1 each. */
  warmth: number;
  dry: number;
  wet: number;
  /** How cold or hot it feels to this character, in degrees. */
  felt: number;
  /** Health lost (negative) or none, per game hour, from the weather. */
  hpPerHour: number;
  /** A word for how the character is doing: 'ok', 'wet', 'cold', 'freezing', 'hot'. */
  status: 'ok' | 'wet' | 'cold' | 'freezing' | 'hot';
}

/** The numbers behind the damage, for one moment. */
export function exposureNow(state: GameState, w: Weather = currentWeather(state)): Exposure {
  const { warmth, dry } = outfitStats(state.outfit);
  const safe = sheltered(state);
  const felt = w.temp + warmth * 18 - state.wet * 6 - w.wind * 4 * (1 - warmth * 0.5);
  let hp = 0;
  if (!safe) {
    hp += 0.7 * w.rain * (1 + 0.5 * w.storm) * (1 - dry * 0.9);
    if (felt < 4) hp += ((4 - felt) / 5) * 1.4;
    if (w.temp > 35) hp += ((w.temp - 35) / 6) * 0.8 * (1 + Math.max(0, warmth - 0.4) * 1.5);
  }
  let status: Exposure['status'] = 'ok';
  if (!safe) {
    if (w.temp > 32) status = 'hot';
    else if (felt < -3) status = 'freezing';
    else if (felt < 4) status = 'cold';
    else if (state.wet > 0.4) status = 'wet';
  }
  return { sheltered: safe, warmth, dry, wet: state.wet, felt, hpPerHour: hp, status };
}

function notify(state: GameState, key: string, text: string, everyHours: number, kind: 'warning' | 'info' = 'warning'): void {
  const last = state.survival.notices[key];
  if (last !== undefined && state.worldSeconds - last < everyHours * HOUR) return;
  state.survival.notices[key] = state.worldSeconds;
  addMessage(state, text, kind);
}

const SEASON_NEWS: Record<string, string> = {
  spring: 'Spring has come. The days are mild and the rain is on and off.',
  summer: 'Summer has begun. Long hot days: watch your water, and heatwaves are possible.',
  autumn: 'Autumn has arrived. The leaves are turning, and the nights are getting cold and wet.',
  winter: 'Winter has set in. Snow and bitter cold: warm, dry clothes matter now.',
};

/** Let game time pass: the weather soaks, chills or burns the player, and season changes are announced. */
export function stepExposure(state: GameState, worldDt: number): void {
  if (state.phase === 'dead') return;
  const rt = runtimeOf(state);
  announceSeason(state);
  if (rt.disabled) return;
  const slices = Math.min(96, Math.max(1, Math.ceil(worldDt / 900)));
  const dt = worldDt / slices;
  const dtH = dt / HOUR;
  const pl = state.player;
  for (let i = 0; i < slices; i++) {
    const t = state.worldSeconds - worldDt + (i + 0.5) * dt;
    const w = rt.weatherOverride ? currentWeather(state) : weatherAt(state.rngSeed, t, state.calendarShift);
    const safe = sheltered(state);
    const { dry } = outfitStats(state.outfit);
    const precip = w.rain + w.snow * 0.5;
    if (!safe && precip > 0.03) state.wet = clamp(state.wet + dtH * precip * 1.2 * Math.pow(1 - dry, 1.5));
    else state.wet = clamp(state.wet - dtH * (safe ? 0.7 : 0.35));

    const e = exposureNow(state, w);
    if (!e.sheltered && w.temp > 30) {
      const load = clamp((w.temp - 30) / 8) * (1 + Math.max(0, e.warmth - 0.4) * 1.5);
      pl.thirst = clamp(pl.thirst - load * 5 * dtH, 0, 100);
    }
    if (!rt.cheats.godMode && e.hpPerHour > 0) pl.health = clamp(pl.health - e.hpPerHour * dtH, 0, 100);
    warn(state, w, e);
    if (pl.health <= 0) {
      state.phase = 'dead';
      addMessage(
        state,
        e.status === 'hot'
          ? 'You collapsed in the heat. Stay in the shade and keep water close when it is this hot.'
          : e.status === 'freezing' || e.status === 'cold'
            ? 'You froze to death. Warm, dry clothes and shelter are not optional in the cold.'
            : 'The weather wore you down. Do not stay out in the storm without proper clothes.',
        'warning',
      );
      return;
    }
  }
}

function warn(state: GameState, w: Weather, e: Exposure): void {
  if (w.storm > 0.55) {
    notify(state, 'storm', w.snow > 0.1 ? 'A blizzard is blowing. Get indoors.' : 'A thunderstorm is rolling in. Lightning is dangerous in the open: get indoors.', 10);
  }
  if (w.anomaly === 'heatwave' && w.anomalyLevel > 0.6) notify(state, 'heatwave', 'A heatwave has started. Stay in the shade, keep water close and wear light clothes.', 24);
  if (w.anomaly === 'coldsnap' && w.anomalyLevel > 0.6) notify(state, 'coldsnap', 'A cold snap has set in. Wear warm clothes if you go out.', 24);
  if (!e.sheltered) {
    if (state.wet > 0.6) notify(state, 'soaked', 'You are soaked through. Find shelter, or put on a raincoat.', 6);
    if (e.status === 'freezing') notify(state, 'freezing', 'You are freezing. Get to shelter and put on something warm.', 5);
    if (e.status === 'hot' && w.temp > 35) notify(state, 'overheating', 'You are overheating. Get out of the sun and drink.', 5);
  }
}

function announceSeason(state: GameState): void {
  const cal = calendarAt(state.rngSeed, state.worldSeconds, state.calendarShift);
  const idx = SEASONS.indexOf(cal.season) + 1;
  const last = state.survival.notices.season;
  state.survival.notices.season = idx;
  // The first call just records the season at the start
  if (last === undefined || last === idx) return;
  addMessage(state, SEASON_NEWS[cal.season] ?? `${SEASON_NAMES[cal.season]} begins.`, 'info');
}

/** Lightning struck at a distance from the player (meters). Returns the damage done, or 0. */
export function lightningStrike(state: GameState, distance: number): number {
  if (state.phase === 'dead' || sheltered(state) || runtimeOf(state).cheats.godMode || distance > 12) return 0;
  const base = distance < 4 ? 40 : 26 - distance;
  const damage = Math.round(base * (1 + state.wet * 0.5));
  state.player.health = clamp(state.player.health - damage, 0, 100);
  addMessage(state, `Lightning struck ${distance < 4 ? 'right beside you' : 'close by'}! You lost ${damage} health. Never stand in the open in a storm.`, 'warning');
  if (state.player.health <= 0) {
    state.phase = 'dead';
    addMessage(state, 'You were killed by lightning.', 'warning');
  }
  return damage;
}
