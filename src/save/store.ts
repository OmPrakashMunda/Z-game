import { CLOTHING } from '../data/clothing';
import { cleanLook } from '../data/looks';
import { placePoint } from '../sim/places';
import { createNewGame, SAVE_VERSION, type GameState, type PlaceId } from '../sim/state';

const DB_NAME = 'zgame';
const STORE = 'saves';
/** How many games can be kept side by side. */
export const SLOT_COUNT = 3;
/**
 * Whose games these are. null is the guest on this device; otherwise the id of the signed-in account. Each account keeps its
 * own copy of the slots in this browser, so two people sharing a browser never see each other's games.
 */
let scope: string | null = null;
export function setSaveScope(next: string | null): void {
  scope = next;
}
const slotKey = (slot: number, s: string | null = scope) => (s ? `u.${s}.slot${slot}` : `slot${slot}`);
const backupKey = (slot: number, s: string | null = scope) => `${slotKey(slot, s)}.backup`;

/** A second copy of the slots somewhere else (the cloud). The newest copy of each slot wins. */
export interface CloudSlots {
  list(): Promise<Map<number, SaveEnvelope>>;
  put(slot: number, envelope: SaveEnvelope): Promise<void>;
  remove(slot: number): Promise<void>;
}
let cloud: CloudSlots | null = null;
export function setCloud(next: CloudSlots | null): void {
  cloud = next;
}

export interface SaveEnvelope {
  version: number;
  /** When it was saved, in milliseconds. Informational only. Never used for gameplay time. */
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; state: GameState; savedAt: number }
  | { status: 'recovered'; state: GameState; savedAt: number; message: string }
  | { status: 'error'; message: string };
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open save database'));
    req.onblocked = () => reject(new Error('Save database is blocked by another tab'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Save database request failed'));
  });
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Build a current-version state from any older save. Known fields are copied when they look right,
 * everything else comes from a fresh game, so old saves keep working as the game grows.
 */
export function migrate(envelope: SaveEnvelope): GameState {
  const d = createNewGame();
  const s = envelope.state as Partial<GameState>;
  const p = (s.player ?? {}) as Partial<GameState['player']>;
  const stores = { ...d.stores };
  for (const [storeId, stock] of Object.entries(s.stores ?? {})) {
    if (stores[storeId]) stores[storeId] = { ...stores[storeId], ...stock };
  }
  return {
    version: SAVE_VERSION,
    worldSeconds: num(s.worldSeconds, d.worldSeconds),
    rngSeed: num(s.rngSeed, d.rngSeed),
    phase: s.phase === 'outbreak' || s.phase === 'dead' ? s.phase : 'prep',
    money: num(s.money, d.money),
    at: typeof s.at === 'string' ? s.at : d.at,
    pos: migratePosition(s, d),
    character: migrateCharacter(s, d),
    outfit: migrateOutfit(s, d),
    wet: Math.min(1, Math.max(0, num(s.wet, 0))),
    calendarShift: num(s.calendarShift, 0),
    plotId: s.plotId ?? null,
    expansion: {
      n: num(s.expansion?.n, 0),
      e: num(s.expansion?.e, 0),
      s: num(s.expansion?.s, 0),
      w: num(s.expansion?.w, 0),
    },
    player: {
      health: num(p.health, d.player.health),
      hunger: num(p.hunger, d.player.hunger),
      thirst: num(p.thirst, d.player.thirst),
      fatigue: num(p.fatigue, d.player.fatigue),
    },
    pack: { ...(s.pack ?? {}) },
    looted: Object.fromEntries(Object.entries(s.looted ?? {}).map(([id, l]) => [id, { day: num(l?.day, 1), left: { ...(l?.left ?? {}) } }])),
    vehicles: Array.isArray(s.vehicles) ? s.vehicles.map((v) => ({ ...v, speed: 0, cargo: { ...(v.cargo ?? {}) }, parts: [...(v.parts ?? [])] })) : [],
    driving: null,
    storage: { ...(s.storage ?? {}) },
    pieces: Array.isArray(s.pieces) ? s.pieces : [],
    survival: {
      mealBuffer: num(s.survival?.mealBuffer, 0),
      waterBuffer: num(s.survival?.waterBuffer, 0),
      fuelBuffer: num(s.survival?.fuelBuffer, 0),
      harvestMeals: num(s.survival?.harvestMeals, 0),
      harvestReportDay: num(s.survival?.harvestReportDay, 0),
      // An older save with a base gets the move-in supplies the first time the new rules run.
      starterGiven: s.survival?.starterGiven === true,
      notices: { ...(s.survival?.notices ?? {}) },
    },
    stores,
    orders: Array.isArray(s.orders) ? s.orders : [],
    messages: Array.isArray(s.messages) && s.messages.length ? s.messages : d.messages,
    directedDay: num(s.directedDay, 1),
    nextId: num(s.nextId, d.nextId + 1000),
  };
}

/** Older saves had only a place name. Put the player at that place's door or on their plot. */
function migratePosition(s: Partial<GameState>, d: GameState): GameState['pos'] {
  const q = s.pos;
  if (q && Number.isFinite(q.x) && Number.isFinite(q.z)) return { x: q.x, z: q.z, heading: num(q.heading, 0) };
  const where = typeof s.at === 'string' ? placePoint({ ...d, plotId: s.plotId ?? null }, s.at as PlaceId) : null;
  return where ? { x: where.x, z: where.z, heading: 0 } : d.pos;
}
function migrateCharacter(s: Partial<GameState>, d: GameState): GameState['character'] {
  const c = s.character;
  const name = typeof c?.name === 'string' ? c.name.trim().slice(0, 20) : '';
  const gender = c?.gender === 'female' ? 'female' : c?.gender === 'male' ? 'male' : d.character.gender;
  return { name: name || 'Survivor', gender, look: cleanLook(c?.look, gender) };
}
function migrateOutfit(s: Partial<GameState>, d: GameState): GameState['outfit'] {
  const out = { ...d.outfit };
  const saved = s.outfit as Record<string, unknown> | undefined;
  if (!saved || typeof saved !== 'object') return out;
  for (const slot of Object.keys(out) as Array<keyof typeof out>) {
    const id = saved[slot];
    out[slot] = typeof id === 'string' && CLOTHING[id]?.slot === slot ? id : null;
  }
  return out;
}
export function isValidEnvelope(e: unknown): e is SaveEnvelope {
  if (!e || typeof e !== 'object') return false;
  const env = e as Partial<SaveEnvelope>;
  const s = env.state as Partial<GameState> | undefined;
  return (
    typeof env.version === 'number' &&
    env.version <= SAVE_VERSION &&
    !!s &&
    typeof s.worldSeconds === 'number' &&
    Number.isFinite(s.worldSeconds) &&
    typeof s.money === 'number'
  );
}

async function readSlot(store: IDBObjectStore, slot: number, s: string | null = scope): Promise<LoadResult> {
  const current = await request(store.get(slotKey(slot, s)));
  const backup = await request(store.get(backupKey(slot, s)));

  if (current === undefined && backup === undefined) return { status: 'none' };
  if (isValidEnvelope(current)) return { status: 'ok', state: migrate(current), savedAt: num(current.savedAt, 0) };
  if (isValidEnvelope(backup)) {
    return {
      status: 'recovered',
      state: migrate(backup),
      savedAt: num(backup.savedAt, 0),
      message: 'Your latest save could not be read. Loaded the previous save instead.',
    };
  }
  return {
    status: 'error',
    message: 'The saved game could not be read (it may be corrupted or from a newer version).',
  };
}

/** The games kept in this browser for one owner, without looking at the cloud. */
async function readLocalSlots(s: string | null): Promise<Array<{ slot: number; result: LoadResult }>> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (err) {
    const result: LoadResult = { status: 'error', message: `Saving is unavailable in this browser: ${String(err)}` };
    return Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, result }));
  }
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const out: Array<{ slot: number; result: LoadResult }> = [];
    for (let slot = 1; slot <= SLOT_COUNT; slot++) out.push({ slot, result: await readSlot(store, slot, s) });
    return out;
  } finally {
    db.close();
  }
}

export async function loadGame(slot = 1): Promise<LoadResult> {
  return (await readLocalSlots(scope))[slot - 1].result;
}

/** Write a save into the browser. The previous valid save is kept as a backup. */
async function writeLocal(envelope: SaveEnvelope, slot: number): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const previous = await request(store.get(slotKey(slot)));
    if (isValidEnvelope(previous)) store.put(previous, backupKey(slot));
    store.put(envelope, slotKey(slot));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Save failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Save was aborted'));
    });
  } finally {
    db.close();
  }
}

export type SlotWhere = 'none' | 'device' | 'both' | 'cloud';

/**
 * What is in each of the save slots, for the slot screen. When there is a cloud copy, the newest copy of each slot wins, and
 * a newer cloud copy is kept in this browser too. `where` says where the shown game is kept.
 */
export async function listSlots(): Promise<Array<{ slot: number; result: LoadResult; where: SlotWhere }>> {
  const local = await readLocalSlots(scope);
  if (!cloud) return local.map(({ slot, result }) => ({ slot, result, where: result.status === 'none' ? 'none' : 'device' }));

  let remote: Map<number, SaveEnvelope> | null = null;
  try {
    remote = await cloud.list();
  } catch (err) {
    console.warn('Could not read the cloud saves', err);
  }
  const out: Array<{ slot: number; result: LoadResult; where: SlotWhere }> = [];
  for (const { slot, result } of local) {
    const env = remote?.get(slot);
    const localAt = result.status === 'ok' || result.status === 'recovered' ? result.savedAt : -1;
    if (isValidEnvelope(env) && env.savedAt > localAt) {
      // The cloud has a newer game (played on another device): show it and keep a copy here
      await writeLocal(env, slot).catch((err) => console.warn('Could not cache the cloud save', err));
      out.push({ slot, result: { status: 'ok', state: migrate(env), savedAt: num(env.savedAt, 0) }, where: 'cloud' });
    } else if (isValidEnvelope(env) && env.savedAt === localAt) {
      out.push({ slot, result, where: 'both' });
    } else if (result.status === 'ok') {
      // This device is ahead of the cloud: bring the cloud up to date
      const ahead: SaveEnvelope = { version: SAVE_VERSION, savedAt: result.savedAt, state: result.state };
      const stored = remote ? await cloud.put(slot, ahead).then(() => true).catch(() => false) : false;
      out.push({ slot, result, where: stored ? 'both' : 'device' });
    } else {
      out.push({ slot, result, where: result.status === 'none' ? 'none' : 'device' });
    }
  }
  return out;
}

/** What the cloud did with a save. */
export type CloudOutcome = 'off' | 'ok' | 'failed';

/** Save the game in the browser and, when signed in, in the cloud too. The game is safe on this device even if the cloud fails. */
export async function saveGame(state: GameState, slot = 1): Promise<{ cloud: CloudOutcome }> {
  const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt: Date.now(), state };
  await writeLocal(envelope, slot);
  if (!cloud) return { cloud: 'off' };
  try {
    await cloud.put(slot, envelope);
    return { cloud: 'ok' };
  } catch (err) {
    console.warn('Could not save to the cloud', err);
    return { cloud: 'failed' };
  }
}

/** Empty a slot, backup included, and take it out of the cloud too. */
export async function deleteGame(slot: number): Promise<void> {
  // The cloud first: if it fails, the game must not quietly come back from there
  if (cloud) await cloud.remove(slot);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(slotKey(slot));
    store.delete(backupKey(slot));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Delete failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Delete was aborted'));
    });
  } finally {
    db.close();
  }
}

/** The games the guest on this device has, for offering them to a new account. */
export async function listGuestGames(): Promise<Array<{ slot: number; state: GameState }>> {
  const games: Array<{ slot: number; state: GameState }> = [];
  for (const { slot, result } of await readLocalSlots(null)) {
    if (result.status === 'ok' || result.status === 'recovered') games.push({ slot, state: result.state });
  }
  return games;
}

/** Copy a guest game into the signed-in account, if that slot is empty there. Returns whether it was copied. */
export async function copyGuestGame(slot: number): Promise<boolean> {
  if (scope === null) return false;
  const here = (await listSlots())[slot - 1];
  if (here.result.status !== 'none') return false;
  const guest = (await readLocalSlots(null))[slot - 1].result;
  if (guest.status !== 'ok' && guest.status !== 'recovered') return false;
  const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt: guest.savedAt, state: guest.state };
  await writeLocal(envelope, slot);
  if (cloud) await cloud.put(slot, envelope);
  return true;
}