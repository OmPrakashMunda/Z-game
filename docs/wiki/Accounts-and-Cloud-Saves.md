# Accounts and cloud saves

Signing in with Google gives you a profile with a **unique username** and keeps your games in the **cloud**, so you can pick them
up on any device. Everything works without it: as a guest you play with saves on this device only.

## For players

- **Sign in** with the button at the top right of the main menu. A Google window opens. Close it to cancel.
- The first time, your username and look are kept with the account. If another player already has your username, you are sent to
  the profile screen to choose another one. Usernames are unique, and "Big Bob" and "big_bob" count as the same name.
- If you played as a guest, the game offers to **copy your guest games** into the account. Slots that already hold a game in the
  account are left alone, and your guest games stay on the device either way. The offer is made once per account.
- Each slot says **Saved to the cloud** or **On this device only**.
- **Sign out** goes back to being a guest. Your account's games are not shown while you are a guest, and come back when you sign in.

### How the saves are kept in step

- Every save goes to this browser first and then to the cloud. If the cloud cannot be reached, the game says so
  ("Saved on this device. The cloud copy could not be updated."), and the next time you open the slots the newer copy is sent.
- If both places have a game for a slot, the **newest save wins**. A game played on another device shows up in its slot.
- Deleting a game removes the cloud copy as well.
- A save is compressed before it is stored. Firestore allows about 1 MiB for one document; the game refuses (and says so) if a
  save ever got bigger than that.

## For developers: setting it up

The game reads its Firebase settings from environment variables at build time. They are not secrets (they only say which project to
talk to; the rules decide who may do what), but they are kept out of git anyway.

1. In the [Firebase console](https://console.firebase.google.com): add a **web app** to your project, turn on **Google** under
   Authentication, and create a **Firestore** database in production mode.
2. Copy `.env.example` to `.env.local` and fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`. Restart `npm run dev`.
3. Deploy the security rules: `firebase deploy --only firestore:rules --project <your project id>` (the repository has
   `firebase.json`, `.firebaserc` and `firestore.rules`).
4. Under Authentication, Settings, **Authorized domains**, add the domain the game is served from. `localhost` is there already.

Leave the variables out, or set `VITE_FIREBASE_DISABLED=1`, and the game runs as a guest: the sign-in button is greyed out.

## What is stored

| Where | What |
| --- | --- |
| `users/{uid}` | The profile: username, the lower-case key of the username, gender, look, time of last change. |
| `users/{uid}/saves/slot1..3` | One compressed (gzip) save each: version, time saved, and the bytes. |
| `usernames/{key}` | `{ uid }`: who owns a username. This makes names unique. |

The game does not store your Google name or email in the database: only the username you choose, your look and your games.

## The security rules (`firestore.rules`)

- Everything is closed unless a rule opens it. A signed-out visitor can read and write nothing.
- You can read and write only `users/{your uid}` and its three save slots, and only with the fields and types the rules expect.
- A username reservation can only be created for your own uid, in the allowed form, and only released by its owner.
  Reservations cannot be changed.
- Any signed-in account may read a reservation (that is how a taken name is noticed).

## In the code

- `src/account/account.ts`: `account` (who is signed in, `signIn`, `signOut`, the profile and the cloud slots), the `Backend`
  interface, `usernameKey`, and `useBackend` for tests.
- `src/account/firebase-backend.ts`: the Firebase version of `Backend`. It is loaded only when the settings exist.
- `src/save/store.ts`: slots per owner (`setSaveScope`: guest or account, so people sharing a browser do not see each other's games),
  `setCloud`, the "newest wins" listing, `copyGuestGame`.
- `src/main.ts`: `applyAccount`, `handleSignIn`, `handleSignOut`, `offerGuestGames`.
- `tests/e2e/cloud.mjs`: the sign-in and cloud flows, against an in-memory stand-in for Firebase.

## Not done yet

- Hosting the game itself (Firebase Hosting) and its domain.
- Deleting an account and its data from inside the game.
- App Check, to stop other websites from using the project's keys.
- Multiplayer: see the [Roadmap](Roadmap.md).
