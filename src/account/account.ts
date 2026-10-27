/**
 * The account behind the profile. Today everyone plays as a guest on this device. This is the one place that will change when
 * sign-in with Google and cloud saves are added: the title screen only asks "who is playing, and can they sign in?".
 */
export interface AccountUser {
  id: string;
  /** 'guest' plays on this device only. 'google' will have cloud saves. */
  kind: 'guest' | 'google';
  /** Shown next to the username, for example "Guest". */
  label: string;
}

export interface Account {
  user(): AccountUser;
  /** Whether signing in is set up. When false the sign-in button says so instead of doing something. */
  readonly canSignIn: boolean;
  signIn(): Promise<AccountUser>;
  signOut(): Promise<void>;
}

const GUEST_KEY = 'zgame.guest';

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

export const account: Account = {
  user: () => ({ id: guestId(), kind: 'guest', label: 'Guest' }),
  canSignIn: false,
  signIn: () => Promise.reject(new Error('Sign-in is not set up yet.')),
  signOut: () => Promise.resolve(),
};
