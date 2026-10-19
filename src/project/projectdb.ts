import { openDatabase } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";

const DB_NAME = "bichig-project";
const DB_STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, (db) => db.createObjectStore(DB_STORE));
}

export async function dbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function dbPut(entries: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      const store = tx.objectStore(DB_STORE);
      for (const [key, value] of Object.entries(entries))
        if (value === undefined) store.delete(key);
        else store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch (error) {
    noteError(error);
  }
}
