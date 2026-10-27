import { cleanLook, defaultLook, type Gender, type Look } from '../data/looks';

/**
 * Who the player is across games: a username and the look they like. It is kept in this browser for now. When accounts are
 * added, the same record is what gets stored with the account.
 */
export interface Profile {
  username: string;
  gender: Gender;
  look: Look;
}

const KEY = 'zgame.profile';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;

/** Why a username is not allowed, or null when it is fine. */
export function usernameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(name)) return 'Use letters, numbers, spaces, _ and - only.';
  return null;
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (typeof p.username !== 'string' || usernameProblem(p.username)) return null;
    const gender: Gender = p.gender === 'female' ? 'female' : 'male';
    return { username: p.username.trim(), gender, look: cleanLook(p.look, gender) };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Could not save the profile', err);
  }
}

/** What a player who has never been here before starts with, apart from the username. */
export function blankProfile(): Profile {
  return { username: '', gender: 'male', look: defaultLook('male') };
}
