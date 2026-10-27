import type { Profile } from '../profile/profile';
import type { CloudSlots } from '../save/store';

/**
 * Who is playing. Everyone starts as a guest on this device. With a Firebase project configured (see .env.example) they can
 * sign in with Google, which gives them a profile with a unique username and their games in the cloud.
 *
 * The title screens and the game only talk to `account`. The Firebase code is loaded on demand from firebase-backend.ts, and a
 * test can swap in a stand-in with `useBackend`.
 */
export interface AccountUser {
  id: string;
  /** 'guest' plays on this device only. 'google' has a profile and cloud saves. */
  kind: 'guest' | 'google';
  /** Shown next to the username, for example "Guest" or "Google". */
  label: string;
  /** The name Google gave, for signed-in users. */
  displayName?: string;
}

export interface BackendUser {
  uid: string;
  name: string;
}

/** What a sign-in service has to provide. */
export interface Backend {
  /** Return the person who is still signed in from last time, if any. */
  restore(): Promise<BackendUser | null>;
  signIn(): Promise<BackendUser>;
  signOut(): Promise<void>;
  loadProfile(uid: string): Promise<Profile | null>;
  /** Claim the username and save the profile. Throws UsernameTakenError if another account has the name. */
  saveProfile(uid: string, profile: Profile, previousUsername?: string): Promise<void>;
  cloudSlots(uid: string): CloudSlots;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('That username is taken.');
    this.name = 'UsernameTakenError';
  }
}

/** The player closed the sign-in window. Not an error worth showing. */
export class SignInCancelled extends Error {
  constructor() {
    super('Sign-in was cancelled.');
    this.name = 'SignInCancelled';
  }
}

/** The form a username is reserved under: lower case, spaces as underscores. "Big Bob" and "big_bob" are the same name. */
export function usernameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

const GUEST_KEY = 'zgame.guest';
/** Remembers that someone was signed in, so the title screen knows whether to wait for the sign-in to come back. */
const HINT_KEY = 'zgame.signedIn';

function setHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1');
    else localStorage.removeItem(HINT_KEY);
  } catch {
    // Without storage the title simply does not wait
  }
}

function guestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = `guest-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return 'guest';
  }
}

/** True when the Firebase settings were provided at build time. */
function hasFirebaseConfig(): boolean {
  const env = import.meta.env;
  // Tests and offline builds can switch it off whatever the other settings say
  if (env.VITE_FIREBASE_DISABLED) return false;
  return !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

let backend: Backend | null = null;
let forced = false;
let current: BackendUser | null = null;
let restoring: Promise<void> | null = null;
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((cb) => cb());

async function loadBackend(): Promise<Backend | null> {
  if (backend) return backend;
  if (!hasFirebaseConfig()) return null;
  const mod = await import('./firebase-backend');
  backend = mod.createFirebaseBackend({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  return backend;
}

export const account = {
  /** Whether signing in is set up. When false the sign-in button says so. */
  get canSignIn(): boolean {
    return forced ? backend !== null : hasFirebaseConfig();
  },

  /** Whether someone was signed in last time, so their sign-in is worth waiting for. */
  expectsSignIn(): boolean {
    try {
      return !!localStorage.getItem(HINT_KEY) && hasFirebaseConfig();
    } catch {
      return false;
    }
  },

  user(): AccountUser {
    if (current) return { id: current.uid, kind: 'google', label: 'Google', displayName: current.name };
    return { id: guestId(), kind: 'guest', label: 'Guest' };
  },

  /** Wait until we know whether someone is still signed in from last time. Never waits long. */
  ready(): Promise<void> {
    if (!restoring) {
      restoring = (async () => {
        try {
          const b = await loadBackend();
          if (!b) return;
          current = await Promise.race([b.restore(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))]);
          setHint(current !== null);
        } catch (err) {
          console.warn('Could not restore the sign-in', err);
        }
      })();
    }
    return restoring;
  },

  onChange(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  async signIn(): Promise<AccountUser> {
    const b = await loadBackend();
    if (!b) throw new Error('Sign-in is not set up.');
    current = await b.signIn();
    setHint(true);
    changed();
    return account.user();
  },

  async signOut(): Promise<void> {
    if (backend && current) await backend.signOut();
    current = null;
    setHint(false);
    changed();
  },

  /** The profile kept with the account, or null for a guest or a new account. */
  async loadProfile(): Promise<Profile | null> {
    if (!backend || !current) return null;
    return backend.loadProfile(current.uid);
  },

  /** Keep the profile with the account (and reserve its username). Does nothing for a guest. */
  async saveProfile(profile: Profile, previousUsername?: string): Promise<void> {
    if (!backend || !current) return;
    await backend.saveProfile(current.uid, profile, previousUsername);
  },

  /** The cloud copy of the save slots for the signed-in account, or null for a guest. */
  cloudSlots(): CloudSlots | null {
    return backend && current ? backend.cloudSlots(current.uid) : null;
  },
};

/** For tests: use this stand-in instead of Firebase (or none). Forgets who was signed in. */
export function useBackend(next: Backend | null): void {
  backend = next;
  forced = true;
  current = null;
  restoring = Promise.resolve();
  changed();
}
