export interface StoredDict {
  ifo: string;
  version: string;
  idx: ArrayBuffer;
  syn: ArrayBuffer | null;
  dict: Blob;
  saved: number;
}

const DB_NAME = "stardict";
const DB_VERSION = 1;
const STORE = "dicts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB алдаа"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB нээгдсэнгүй"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await run(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

export async function readStoredDict(key: string): Promise<StoredDict | null> {
  try {
    const value = await withStore("readonly", (store) =>
      request<StoredDict | undefined>(store.get(key)),
    );
    return value ?? null;
  } catch (_) {
    return null;
  }
}

export async function writeStoredDict(
  key: string,
  value: StoredDict,
): Promise<boolean> {
  try {
    await withStore("readwrite", (store) => request(store.put(value, key)));
    return true;
  } catch (_) {
    return false;
  }
}

export async function removeStoredDict(key: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => request(store.delete(key)));
  } catch (_) {}
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return false;
  }
}
