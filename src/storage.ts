import {
  KEYS,
  at,
  read,
  readJson,
  remove,
  type StoreKey,
  writeJson,
} from "./store.ts";
const IDB_TEXT_KEY = "text";
const DB_NAME = "mn-spell";
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

export interface DraftFile {
  name: string;
  kind: "text" | "office";
}

export function saveDraftFile(ref: DraftFile | null, slot: string): void {
  if (ref === null) remove(at(KEYS.fileRef, slot));
  else writeJson(at(KEYS.fileRef, slot), ref);
}

function draftFile(key: StoreKey): DraftFile | null {
  const value = readJson(key) as Partial<DraftFile> | null;
  if (typeof value?.name !== "string" || value.name === "") return null;
  return {
    name: value.name,
    kind: value.kind === "office" ? "office" : "text",
  };
}

export function loadDraftFile(slot: string): DraftFile | null {
  return draftFile(at(KEYS.fileRef, slot));
}

export function loadLegacyDraftFile(): DraftFile | null {
  return draftFile(KEYS.legacyFile);
}

export function dropSharedDraft(): Promise<void> {
  remove(KEYS.legacyText);
  remove(KEYS.legacyTier);
  remove(KEYS.legacyFile);
  return idbDelete(IDB_TEXT_KEY)
    .then(() => undefined)
    .catch(() => undefined);
}

export function loadDraft(): Promise<string | null> {
  if (getTier() === "idb") {
    return idbGet(IDB_TEXT_KEY)
      .then((storedText) =>
        typeof storedText === "string" ? storedText : readLocal(),
      )
      .catch(readLocal);
  }
  return Promise.resolve(readLocal());
}

const SLOT_PREFIX = "slot:";
const OFFICE_FILE_KEY = "office-file";

function officeKey(slot?: string): string {
  return slot === undefined ? OFFICE_FILE_KEY : OFFICE_FILE_KEY + ":" + slot;
}

export function saveOfficeFile(file: File, slot?: string): Promise<void> {
  return idbSet(officeKey(slot), file).then(() => undefined);
}

export function loadOfficeFile(slot?: string): Promise<File | null> {
  return idbGet(officeKey(slot)).then((value) =>
    value instanceof File ? value : null,
  );
}

export function dropOfficeFile(slot?: string): Promise<void> {
  return idbDelete(officeKey(slot)).then(() => undefined);
}

export function saveSlotText(key: string, text: string): Promise<void> {
  return idbSet(SLOT_PREFIX + key, text).then(() => undefined);
}

export function loadSlotText(key: string): Promise<string | null> {
  return idbGet(SLOT_PREFIX + key).then((value) =>
    typeof value === "string" ? value : null,
  );
}

export function dropSlotText(key: string): Promise<void> {
  return idbDelete(SLOT_PREFIX + key).then(() => undefined);
}

function readLocal(): string | null {
  return read(KEYS.legacyText);
}

function getTier(): string | null {
  return read(KEYS.legacyTier);
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = run(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function storedTexts(): Promise<string[]> {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key === null ? null : localStorage.getItem(key);
      if (value) out.push(value);
    }
  } catch (_) {}
  try {
    const values = await idbRequest(
      "readonly",
      (store) => store.getAll() as IDBRequest<unknown[]>,
    );
    for (const value of values) if (typeof value === "string") out.push(value);
  } catch (_) {}
  return out;
}

const idbGet = (key: string) =>
  idbRequest("readonly", (store) => store.get(key) as IDBRequest<unknown>);
const idbSet = (key: string, value: unknown) =>
  idbRequest("readwrite", (store) => store.put(value, key));
const idbDelete = (key: string) =>
  idbRequest("readwrite", (store) => store.delete(key));
