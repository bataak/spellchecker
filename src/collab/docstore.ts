import { databaseOpener, requestResult, transactionDone } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";

const DB_NAME = "bichig-collab";
const STORE = "docs";

interface Stored {
  readonly room: string;
  readonly state: Uint8Array;
  readonly at: number;
}

const openDb = databaseOpener(DB_NAME, (db) =>
  db.createObjectStore(STORE, { keyPath: "room" }),
);

export async function loadDoc(room: string): Promise<Uint8Array | null> {
  try {
    const db = await openDb();
    const stored = await requestResult<Stored | undefined>(
      db.transaction(STORE).objectStore(STORE).get(room),
    );
    return stored?.state ?? null;
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function saveDoc(room: string, state: Uint8Array): Promise<void> {
  try {
    const db = await openDb();
    await requestResult(
      db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put({ room, state, at: Date.now() } satisfies Stored),
    );
  } catch (error) {
    noteError(error);
  }
}

export async function dropDoc(room: string): Promise<void> {
  try {
    const db = await openDb();
    await requestResult(
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(room),
    );
  } catch (error) {
    noteError(error);
  }
}

export interface StoredLog {
  readonly base: Uint8Array | null;
  readonly updates: readonly Uint8Array[];
  readonly keys: readonly string[];
}

const logPrefix = (room: string): string => "log:" + room + ":";

const logRange = (room: string): IDBKeyRange =>
  IDBKeyRange.bound(logPrefix(room), logPrefix(room) + "\uffff");

export function logKey(room: string): string {
  return (
    logPrefix(room) +
    Date.now().toString(36).padStart(9, "0") +
    Math.random().toString(36).slice(2, 8)
  );
}

export async function loadLog(room: string): Promise<StoredLog> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE).objectStore(STORE);
    const [base, logs] = await Promise.all([
      requestResult<Stored | undefined>(store.get(room)),
      requestResult<Stored[]>(store.getAll(logRange(room))),
    ]);
    return {
      base: base?.state ?? null,
      updates: logs.map((log) => log.state),
      keys: logs.map((log) => log.room),
    };
  } catch (error) {
    noteError(error);
    return { base: null, updates: [], keys: [] };
  }
}

export async function appendLog(
  key: string,
  update: Uint8Array,
): Promise<boolean> {
  try {
    const db = await openDb();
    await requestResult(
      db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put({ room: key, state: update, at: Date.now() } satisfies Stored),
    );
    return true;
  } catch (error) {
    noteError(error);
    return false;
  }
}

export async function compactLog(
  room: string,
  state: Uint8Array,
  keys: readonly string[],
): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ room, state, at: Date.now() } satisfies Stored);
    for (const key of keys) store.delete(key);
    await transactionDone(tx);
    return true;
  } catch (error) {
    noteError(error);
    return false;
  }
}

async function dropLog(room: string): Promise<void> {
  try {
    const db = await openDb();
    await requestResult(
      db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .delete(logRange(room)),
    );
  } catch (error) {
    noteError(error);
  }
}

export const docKey = {
  baseline: (room: string): string => "base:" + room,
  chat: (room: string): string => "chat:" + room,
  mine: (room: string): string => "mine:" + room,
  rejected: (room: string): string => "rejected:" + room,
} as const;

export async function dropRoom(room: string): Promise<void> {
  const keys = [room, ...Object.values(docKey).map((key) => key(room))];
  await Promise.all([...keys.map(dropDoc), ...keys.map(dropLog)]);
}
