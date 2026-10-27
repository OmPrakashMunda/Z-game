import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';
import { Bytes, collection, deleteDoc, doc, getDoc, getDocs, getFirestore, runTransaction, setDoc, type Firestore } from 'firebase/firestore';
import { cleanLook } from '../data/looks';
import type { Profile } from '../profile/profile';
import { isValidEnvelope, type CloudSlots, type SaveEnvelope } from '../save/store';
import { SignInCancelled, UsernameTakenError, usernameKey, type Backend, type BackendUser } from './account';

/**
 * Sign-in with Google and the cloud, on Firebase. Auth keeps who is signed in; Firestore keeps, for each account:
 *   users/{uid}               the profile (username, gender, look)
 *   users/{uid}/saves/slotN   each saved game, compressed
 *   usernames/{key}           which account owns a username, so names are unique
 * firestore.rules decides who may read and write them.
 */

export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/** A save is limited by Firestore to about 1 MiB per document. */
const MAX_SAVE_BYTES = 900_000;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const toUser = (u: User): BackendUser => ({ uid: u.uid, name: u.displayName ?? u.email ?? 'Google user' });

export function createFirebaseBackend(settings: FirebaseSettings): Backend {
  const app = initializeApp(settings);
  const auth: Auth = getAuth(app);
  const db: Firestore = getFirestore(app);

  const saveRef = (uid: string, slot: number) => doc(db, 'users', uid, 'saves', `slot${slot}`);

  return {
    async restore() {
      await auth.authStateReady();
      return auth.currentUser ? toUser(auth.currentUser) : null;
    },

    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const result = await signInWithPopup(auth, provider);
        return toUser(result.user);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new SignInCancelled();
        throw err;
      }
    },

    async signOut() {
      await signOut(auth);
    },

    async loadProfile(uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      const gender = d.gender === 'female' ? 'female' : 'male';
      return { username: String(d.username), gender, look: cleanLook(d.look, gender) };
    },

    async saveProfile(uid, profile: Profile, previousUsername) {
      const key = usernameKey(profile.username);
      const previousKey = previousUsername ? usernameKey(previousUsername) : null;
      await runTransaction(db, async (tx) => {
        const nameRef = doc(db, 'usernames', key);
        const name = await tx.get(nameRef);
        if (name.exists() && name.data().uid !== uid) throw new UsernameTakenError();
        // Let go of the old name when it changes (only if it was ours)
        const oldRef = previousKey && previousKey !== key ? doc(db, 'usernames', previousKey) : null;
        const old = oldRef ? await tx.get(oldRef) : null;

        if (!name.exists()) tx.set(nameRef, { uid });
        if (oldRef && old?.exists() && old.data().uid === uid) tx.delete(oldRef);
        tx.set(doc(db, 'users', uid), {
          username: profile.username,
          usernameKey: key,
          gender: profile.gender,
          look: profile.look,
          updatedAt: Date.now(),
        });
      });
    },

    cloudSlots(uid): CloudSlots {
      return {
        async list() {
          const out = new Map<number, SaveEnvelope>();
          const snaps = await getDocs(collection(db, 'users', uid, 'saves'));
          for (const s of snaps.docs) {
            const slot = Number(s.id.replace('slot', ''));
            if (!Number.isInteger(slot)) continue;
            try {
              const raw = s.data().data as Bytes;
              const envelope: unknown = JSON.parse(await gunzip(raw.toUint8Array()));
              if (isValidEnvelope(envelope)) out.set(slot, envelope);
            } catch (err) {
              console.warn(`The cloud save in slot ${slot} could not be read`, err);
            }
          }
          return out;
        },

        async put(slot, envelope) {
          const bytes = await gzip(JSON.stringify(envelope));
          if (bytes.length > MAX_SAVE_BYTES) throw new Error('This game is too big to keep in the cloud.');
          await setDoc(saveRef(uid, slot), { version: envelope.version, savedAt: envelope.savedAt, data: Bytes.fromUint8Array(bytes) });
        },

        async remove(slot) {
          await deleteDoc(saveRef(uid, slot));
        },
      };
    },
  };
}
