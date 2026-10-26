import { placePoint } from '../sim/places';
import { createNewGame, SAVE_VERSION, type GameState, type PlaceId } from '../sim/state';

const DB_NAME = 'zgame';
const STORE = 'saves';
const SLOT = 'slot1';
const BACKUP = 'slot1.backup';

interface SaveEnvelope {
  version: number;
  /** Informational only. Never used for gameplay time. */
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; state: GameState }
  | { status: 'recovered'; state: GameState; message: string }
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
function isValidEnvelope(e: unknown): e is SaveEnvelope {
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

export async function loadGame(): Promise<LoadResult> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (err) {
    return { status: 'error', message: `Saving is unavailable in this browser: ${String(err)}` };
  }
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const current = await request(store.get(SLOT));
    const backup = await request(store.get(BACKUP));

    if (current === undefined && backup === undefined) return { status: 'none' };
    if (isValidEnvelope(current)) return { status: 'ok', state: migrate(current) };
    if (isValidEnvelope(backup)) {
      return {
        status: 'recovered',
        state: migrate(backup),
        message: 'Your latest save could not be read. Loaded the previous save instead.',
      };
    }
    return {
      status: 'error',
      message: 'The saved game could not be read (it may be corrupted or from a newer version).',
    };
  } finally {
    db.close();
  }
}

/** Write the save. The previous valid save is kept as a backup. */
export async function saveGame(state: GameState): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const previous = await request(store.get(SLOT));
    if (isValidEnvelope(previous)) store.put(previous, BACKUP);
    const envelope: SaveEnvelope = { version: SAVE_VERSION, savedAt: Date.now(), state };
    store.put(envelope, SLOT);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Save failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Save was aborted'));
    });
  } finally {
    db.close();
  }
}
