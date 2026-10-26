import { openDatabase, requestResult, transactionDone } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";

const DB_NAME = "bichig-project";
const DB_STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, (db) => db.createObjectStore(DB_STORE));
}

export async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const store = db.transaction(DB_STORE).objectStore(DB_STORE);
    const value: T | undefined = await requestResult(store.get(key));
    return value ?? null;
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function dbPut(entries: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    for (const [key, value] of Object.entries(entries))
      if (value === undefined) store.delete(key);
      else store.put(value, key);
    await transactionDone(tx);
  } catch (error) {
    noteError(error);
  }
}
