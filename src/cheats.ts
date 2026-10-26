import { UTILITIES } from './data/survival';
import { upkeepOf, MAX_UPGRADE } from './data/upkeep';
import { dayOf, worldSecondsAt } from './sim/clock';
import { stepSim } from './sim/step';
import type { GameState } from './sim/state';
import { maxHpFor } from './sim/upkeep';
import { runtimeOf } from './sim/utilities';
import { runMoveCheat } from './cheats-move';
import { CLOTHING } from './data/clothing';
import { SEASON_DAYS, SEASONS, YEAR_DAYS, calendarAt, type Season } from './sim/weather';

/**
 * Cheat codes. Type them in the cheat box (press the backquote key).
 *
 * Cheats last for the current session only. They live in places that are never saved (the game's runtime notes, and
 * the two session settings below), so leaving the game, reloading the page or loading a save switches them all off.
 */

export type WeatherMode = 'normal' | 'none' | 'always' | 'storm' | 'snow';

/** The cheats that act on the picture rather than the rules. They are reset whenever a game is loaded or left. */
export const session: { weather: WeatherMode; carsHidden: boolean } = { weather: 'normal', carsHidden: false };

/** What the cheat box needs from the rest of the game. */
export interface CheatHost {
  state: GameState;
  setWeather(mode: WeatherMode): void;
  setCarsHidden(hidden: boolean): void;
  /** Redraw the base and the screens after the game was changed behind the scenes, and save soon. */
  changed(): void;
  /** Add the sandbox funds, with the usual sound and message. */
  addFunds(): string;
  buildWoodsBase(): string;
  finishAll(): string;
  /** Put the player (and the vehicle they are driving) at a spot at once. */
  teleport(x: number, z: number): void;
  /** The waypoint the player set, if any. */
  getWaypoint(): { x: number; z: number; name: string } | null;
}

/** Switch every picture-only cheat off. Called when leaving a game or loading another one. */
export function resetCheatSession(host?: Pick<CheatHost, 'setWeather' | 'setCarsHidden'>): void {
  session.weather = 'normal';
  session.carsHidden = false;
  host?.setWeather('normal');
  host?.setCarsHidden(false);
}

/** Names of the cheats that are on right now. */
export function activeCheats(state: GameState | null): string[] {
  const out: string[] = [];
  if (state) {
    const c = runtimeOf(state).cheats;
    if (c.hourLock === 12) out.push('NONIGHT');
    if (c.hourLock === 0) out.push('NODAY');
    if (c.instantBuild) out.push('NOBUILDTIME');
    if (c.noWear) out.push('NOWEAR');
    if (c.freeWork) out.push('FREEREPAIRS');
    if (c.godMode) out.push('GODMODE');
    if (c.freeShop) out.push('FREESHOP');
    if (c.freeze) out.push('FREEZETIME');
    if (c.freeFuel) out.push('ENDLESSFUEL');
    if (c.noDamage) out.push('TOUGHCARS');
    if (c.quickSearch) out.push('QUICKSEARCH');
    if (c.fastFeet) out.push('FASTFEET');
    if (c.noClip) out.push('NOCLIP');
    if (c.bigPack) out.push('BIGPACK');
    if (c.turbo) out.push('TURBO');
  }
  if (session.weather === 'none') out.push('NORAIN');
  if (session.weather === 'always') out.push('RAINALLDAY');
  if (session.weather === 'storm') out.push('STORM');
  if (session.weather === 'snow') out.push('SNOWFALL');
  if (session.carsHidden) out.push('NOCARS');
  return out;
}

export interface CheatInfo {
  code: string;
  kind: 'switch' | 'once';
  what: string;
}

/** Every cheat, in the order the help lists them. The README and wiki repeat this table. */
export const CHEAT_LIST: CheatInfo[] = [
  { code: 'NONIGHT', kind: 'switch', what: 'It is always daytime (12:00): light, solar panels and lamps follow.' },
  { code: 'NODAY', kind: 'switch', what: 'It is always the middle of the night.' },
  { code: 'NORAIN', kind: 'switch', what: 'It never rains.' },
  { code: 'RAINALLDAY', kind: 'switch', what: 'It rains all the time.' },
  { code: 'STORM', kind: 'switch', what: 'A thunderstorm rages all the time, with lightning.' },
  { code: 'SNOWFALL', kind: 'switch', what: 'It snows all the time.' },
  { code: 'NOBUILDTIME', kind: 'switch', what: 'Everything you place is finished at once.' },
  { code: 'NOCARS', kind: 'switch', what: 'Hides the traffic on the roads.' },
  { code: 'NOWEAR', kind: 'switch', what: 'Nothing wears out or gets dirty.' },
  { code: 'FREEREPAIRS', kind: 'switch', what: 'Repairs, upgrades and cleaning cost nothing and need no tools.' },
  { code: 'GODMODE', kind: 'switch', what: 'Your family never gets hungry or thirsty and never loses health.' },
  { code: 'FREESHOP', kind: 'switch', what: 'Everything in every shop costs nothing.' },
  { code: 'FREEZETIME', kind: 'switch', what: 'The world clock stops (you can still walk and drive).' },
  { code: 'ENDLESSFUEL', kind: 'switch', what: 'Vehicles use no fuel.' },
  { code: 'TOUGHCARS', kind: 'switch', what: 'Crashes do no damage to your vehicles.' },
  { code: 'QUICKSEARCH', kind: 'switch', what: 'Searching a house takes no time.' },
  { code: 'FASTFEET', kind: 'switch', what: 'You walk and run three times as fast.' },
  { code: 'NOCLIP', kind: 'switch', what: 'Walls, houses, trees and fences no longer stop you or your vehicles.' },
  { code: 'BIGPACK', kind: 'switch', what: 'Your backpack and your vehicles carry any weight.' },
  { code: 'TURBO', kind: 'switch', what: 'Vehicles are twice as fast and pick up speed twice as quickly.' },
  { code: 'BUILDNOW', kind: 'once', what: 'Finishes everything that is being built.' },
  { code: 'MONEY', kind: 'once', what: 'Adds $500,000.' },
  { code: 'SETMONEY n', kind: 'once', what: 'Sets your money to n dollars.' },
  { code: 'SKIPDAY', kind: 'once', what: 'Jumps to 08:00 the next day.' },
  { code: 'SETDAY n', kind: 'once', what: 'Jumps forward to 08:00 on day n.' },
  { code: 'FIXALL', kind: 'once', what: 'Repairs and cleans every structure.' },
  { code: 'MAXUPGRADE', kind: 'once', what: 'Upgrades every structure that can be upgraded to level 3.' },
  { code: 'GIVETOOLS', kind: 'once', what: 'Gives the four tools and plenty of repair materials.' },
  { code: 'STOCKUP', kind: 'once', what: 'Gives food, water, fuel, seeds and animal feed.' },
  { code: 'FULLTANKS', kind: 'once', what: 'Fills every water tank and battery.' },
  { code: 'BACKTOBASE', kind: 'once', what: 'Takes you (and the vehicle you are driving) to the middle of your land.' },
  { code: 'GOTO place', kind: 'once', what: 'Takes you to a place: base, motel, realty, hardware, supermarket, pharmacy, guns, farmsupply, gas, dealer, woods, farmstead, warehouse or creekside.' },
  { code: 'GOTOHOUSE', kind: 'once', what: 'Takes you to the door of the nearest house nobody has searched.' },
  { code: 'GOTOCAR', kind: 'once', what: 'Takes you to your nearest vehicle.' },
  { code: 'CALLCAR', kind: 'once', what: 'Brings your nearest vehicle to you.' },
  { code: 'GOTOWAYPOINT', kind: 'once', what: 'Takes you to the waypoint you set.' },
  { code: 'COORDS x z', kind: 'once', what: 'Takes you to a map position, for example COORDS 150 -40.' },
  { code: 'WHEREAMI', kind: 'once', what: 'Tells you your map position and where you are.' },
  { code: 'GIVECAR type', kind: 'once', what: 'Parks a vehicle with a full tank in front of you: bicycle, scooter, sedan, pickup, van, suv or truck (pickup if you leave it out).' },
  { code: 'REFUELALL', kind: 'once', what: 'Fills the tank of every vehicle you own.' },
  { code: 'REPAIRCARS', kind: 'once', what: 'Repairs every vehicle you own.' },
  { code: 'EMPTYPACK', kind: 'once', what: 'Moves everything in your backpack into storage, wherever you are.' },
  { code: 'RESETHOUSES', kind: 'once', what: 'Makes every searched house full again.' },
  { code: 'WOODSBASE', kind: 'once', what: 'Buys the Deep Woods plot, grows it and builds a finished base.' },
  { code: 'NORMALTIME', kind: 'once', what: 'Turns off NONIGHT, NODAY and FREEZETIME.' },
  { code: 'NORMALWEATHER', kind: 'once', what: 'Turns off NORAIN, RAINALLDAY, STORM and SNOWFALL.' },
  { code: 'SETSEASON name', kind: 'once', what: 'Moves the calendar to early spring, summer, autumn or winter.' },
  { code: 'GIVECLOTHES', kind: 'once', what: 'Puts one of every piece of clothing into your storage.' },
  { code: 'RESETCHEATS', kind: 'once', what: 'Turns every switch off.' },
  { code: 'HELP', kind: 'once', what: 'Lists the cheats and which are on.' },
];

const onOff = (on: boolean) => (on ? 'on' : 'off');

/** Turn a switch on if it is off and off if it is on. */
function flip(name: string, now: boolean, explain: string): string {
  return now ? `${name} on. ${explain} Type it again to turn it off.` : `${name} off.`;
}

function giveAtLeast(state: GameState, item: string, qty: number): void {
  state.storage[item] = Math.max(state.storage[item] ?? 0, qty);
}

function give(state: GameState, item: string, qty: number): void {
  state.storage[item] = (state.storage[item] ?? 0) + qty;
}

/** Run a typed cheat code and return the line to show under the box. */
export function runCheatCode(raw: string, host: CheatHost): string {
  const [word, ...rest] = raw.trim().toLowerCase().split(/\s+/);
  const arg = rest.join(' ');
  const state = host.state;
  const c = runtimeOf(state).cheats;

  switch (word) {
    // ---- Switches
    case 'nonight':
      c.hourLock = c.hourLock === 12 ? null : 12;
      host.changed();
      return flip('NONIGHT', c.hourLock === 12, 'It is always daytime.');
    case 'noday':
      c.hourLock = c.hourLock === 0 ? null : 0;
      host.changed();
      return flip('NODAY', c.hourLock === 0, 'It is always night.');
    case 'norain':
      session.weather = session.weather === 'none' ? 'normal' : 'none';
      host.setWeather(session.weather);
      return flip('NORAIN', session.weather === 'none', 'It never rains.');
    case 'storm':
      session.weather = session.weather === 'storm' ? 'normal' : 'storm';
      host.setWeather(session.weather);
      return flip('STORM', session.weather === 'storm', 'A thunderstorm rages.');
    case 'snowfall':
      session.weather = session.weather === 'snow' ? 'normal' : 'snow';
      host.setWeather(session.weather);
      return flip('SNOWFALL', session.weather === 'snow', 'It snows.');
    case 'setseason': {
      const idx = SEASONS.indexOf(arg.trim() as Season);
      if (idx < 0) return 'Use it like this: SETSEASON winter. Seasons: spring, summer, autumn, winter.';
      const cal = calendarAt(state.rngSeed, state.worldSeconds, state.calendarShift);
      state.calendarShift += idx * SEASON_DAYS + 2 - cal.yearPhase * YEAR_DAYS;
      host.changed();
      return `The calendar now reads early ${arg.trim()}.`;
    }
    case 'giveclothes':
      for (const id of Object.keys(CLOTHING)) give(state, id, 1);
      host.changed();
      return 'Done. One of every piece of clothing is in your storage.';
    case 'rainallday':
      session.weather = session.weather === 'always' ? 'normal' : 'always';
      host.setWeather(session.weather);
      return flip('RAINALLDAY', session.weather === 'always', 'It rains all the time.');
    case 'nobuildtime':
      c.instantBuild = !c.instantBuild;
      if (c.instantBuild) for (const p of state.pieces) p.progress = 1;
      host.changed();
      return flip('NOBUILDTIME', c.instantBuild, 'Everything is finished the moment it is placed.');
    case 'nocars':
      session.carsHidden = !session.carsHidden;
      host.setCarsHidden(session.carsHidden);
      return flip('NOCARS', session.carsHidden, 'The roads are empty.');
    case 'nowear':
      c.noWear = !c.noWear;
      return flip('NOWEAR', c.noWear, 'Nothing wears out.');
    case 'freerepairs':
      c.freeWork = !c.freeWork;
      host.changed();
      return flip('FREEREPAIRS', c.freeWork, 'Repairs, upgrades and cleaning are free.');
    case 'godmode':
      c.godMode = !c.godMode;
      host.changed();
      return flip('GODMODE', c.godMode, 'Your family cannot get hungry, thirsty or hurt.');
    case 'freeshop':
      c.freeShop = !c.freeShop;
      host.changed();
      return flip('FREESHOP', c.freeShop, 'Everything costs nothing.');
    case 'freezetime':
      c.freeze = !c.freeze;
      return flip('FREEZETIME', c.freeze, 'The clock is stopped.');
    case 'endlessfuel':
      c.freeFuel = !c.freeFuel;
      return flip('ENDLESSFUEL', c.freeFuel, 'Vehicles use no fuel.');
    case 'toughcars':
      c.noDamage = !c.noDamage;
      return flip('TOUGHCARS', c.noDamage, 'Crashes do no damage.');
    case 'quicksearch':
      c.quickSearch = !c.quickSearch;
      return flip('QUICKSEARCH', c.quickSearch, 'Searching takes no time.');

    // ---- One-off
    case 'buildnow':
      return host.finishAll();
    case 'money':
      return host.addFunds();
    case 'woodsbase':
      return host.buildWoodsBase();
    case 'setmoney': {
      const n = Number(arg.replace(/[$,]/g, ''));
      if (!Number.isFinite(n) || n < 0) return 'Use it like this: SETMONEY 250000';
      state.money = Math.round(n);
      host.changed();
      return `Done. You have $${state.money.toLocaleString('en-US')}.`;
    }
    case 'skipday': {
      const target = worldSecondsAt(dayOf(state.worldSeconds) + 1, 8);
      stepSim(state, 0, target - state.worldSeconds);
      host.changed();
      return `Done. It is day ${dayOf(state.worldSeconds)}, 08:00.`;
    }
    case 'setday': {
      const day = Math.floor(Number(arg));
      if (!Number.isFinite(day) || day < 1) return 'Use it like this: SETDAY 12';
      const target = worldSecondsAt(day, 8);
      if (target <= state.worldSeconds) return 'Time only goes forward. Pick a later day.';
      stepSim(state, 0, target - state.worldSeconds);
      host.changed();
      return `Done. It is day ${dayOf(state.worldSeconds)}, 08:00.`;
    }
    case 'fixall': {
      let n = 0;
      for (const p of state.pieces) {
        if (!upkeepOf(p.type)) continue;
        p.hp = p.maxHp;
        p.dirt = 0;
        n++;
      }
      host.changed();
      return n ? `Done. ${n} structure${n === 1 ? '' : 's'} repaired and cleaned.` : 'Nothing needed repairing.';
    }
    case 'maxupgrade': {
      let n = 0;
      for (const p of state.pieces) {
        if (!upkeepOf(p.type) || p.progress < 1) continue;
        p.upgrade = MAX_UPGRADE;
        p.maxHp = maxHpFor(p.type, MAX_UPGRADE);
        p.hp = p.maxHp;
        n++;
      }
      host.changed();
      return n ? `Done. ${n} structure${n === 1 ? '' : 's'} upgraded to level ${MAX_UPGRADE}.` : 'Nothing to upgrade.';
    }
    case 'givetools':
      for (const tool of ['toolbox', 'shovel', 'power_tools', 'welding_kit']) giveAtLeast(state, tool, 1);
      for (const item of ['lumber', 'nails', 'concrete', 'steel_sheet', 'screws', 'wire_spool', 'sandbags']) give(state, item, 20);
      give(state, 'soap', 10);
      host.changed();
      return 'Done. Four tools and plenty of materials are in your storage.';
    case 'stockup':
      for (const [item, qty] of [['canned_food', 30], ['bottled_water', 30], ['rice', 10], ['gasoline', 6], ['seeds_veg', 20], ['animal_feed', 10]] as const) give(state, item, qty);
      host.changed();
      return 'Done. Food, water, fuel, seeds and animal feed are in your storage.';
    case 'fulltanks': {
      let n = 0;
      for (const p of state.pieces) {
        if (p.progress < 1) continue;
        const u = UTILITIES[p.type];
        if (u?.water?.storeL) {
          p.level = u.water.storeL;
          n++;
        } else if (u?.power?.storeKwh) {
          p.level = u.power.storeKwh;
          n++;
        }
      }
      host.changed();
      return n ? `Done. ${n} tank${n === 1 ? '' : 's'} and batter${n === 1 ? 'y' : 'ies'} filled.` : 'You have no tanks or batteries yet.';
    }
    case 'normaltime':
      c.hourLock = null;
      c.freeze = false;
      host.changed();
      return 'Time is back to normal.';
    case 'normalweather':
      session.weather = 'normal';
      host.setWeather('normal');
      return 'The weather is back to normal.';
    case 'resetcheats':
    case 'nocheats':
      Object.assign(c, { hourLock: null, instantBuild: false, noWear: false, freeWork: false, godMode: false, freeShop: false, freeze: false, freeFuel: false, noDamage: false, quickSearch: false, fastFeet: false, noClip: false, bigPack: false, turbo: false });
      resetCheatSession(host);
      host.changed();
      return 'Every cheat switch is off.';
    case 'help':
    case 'cheats':
    case '?': {
      const on = activeCheats(state);
      const switches = CHEAT_LIST.filter((x) => x.kind === 'switch').map((x) => `${x.code}${on.includes(x.code) ? ' (' + onOff(true) + ')' : ''}`);
      const once = CHEAT_LIST.filter((x) => x.kind === 'once' && !/^(HELP|NORMAL|RESET)/.test(x.code)).map((x) => x.code);
      return `Switches: ${switches.join(', ')}. One-off: ${once.join(', ')}. Also NORMALTIME, NORMALWEATHER, RESETCHEATS.`;
    }
    default: {
      const moved = runMoveCheat(word, arg, host);
      if (moved !== null) return moved;
      return `Unknown code "${raw.trim()}". Type HELP for the list.`;
    }
  }
}
