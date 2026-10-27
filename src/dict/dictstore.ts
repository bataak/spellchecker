import { databaseOpener, requestResult } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";

export interface StoredDict {
  ifo: string;
  version: string;
  idx: ArrayBuffer;
  syn: ArrayBuffer | null;
  dict: Blob;
  saved: number;
}

const DB_NAME = "stardict";
const STORE = "dicts";

const openDb = databaseOpener(DB_NAME, (db) => db.createObjectStore(STORE));

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  return run(db.transaction(STORE, mode).objectStore(STORE));
}

export async function readStoredDict(key: string): Promise<StoredDict | null> {
  try {
    const value = await withStore("readonly", (store) =>
      requestResult<StoredDict | undefined>(store.get(key)),
    );
    return value ?? null;
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function writeStoredDict(
  key: string,
  value: StoredDict,
): Promise<boolean> {
  try {
    await withStore("readwrite", (store) =>
      requestResult(store.put(value, key)),
    );
    return true;
  } catch (error) {
    noteError(error);
    return false;
  }
}

export async function removeStoredDict(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => requestResult(store.delete(key)));
  } catch (error) {
    noteError(error);
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
