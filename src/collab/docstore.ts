import { openDatabase, requestResult } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";

const DB_NAME = "bichig-collab";
const STORE = "docs";

interface Stored {
  readonly room: string;
  readonly state: Uint8Array;
  readonly at: number;
}

function openDb(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, (db) =>
    db.createObjectStore(STORE, { keyPath: "room" }),
  );
}

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

export const docKey = {
  baseline: (room: string): string => "base:" + room,
  chat: (room: string): string => "chat:" + room,
  mine: (room: string): string => "mine:" + room,
  rejected: (room: string): string => "rejected:" + room,
} as const;

export async function dropRoom(room: string): Promise<void> {
  const keys = [room, ...Object.values(docKey).map((key) => key(room))];
  await Promise.all(keys.map(dropDoc));
}
