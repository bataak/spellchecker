const TEXT_KEY = "mn-spell:text";
const TIER_KEY = "mn-spell:tier";
const IDB_TEXT_KEY = "text";
const LS_TIER_MAX = 1000000;
const IDB_THROTTLE_MS = 3000;
const DB_NAME = "mn-spell";
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;
let onError: (() => void) | null = null;
let saveSeq = 0;
let pendingText: string | null = null;
let pendingSeq = 0;
let idbTimer: ReturnType<typeof setTimeout> | null = null;
let lastIdbWrite = 0;

export function initDraftStorage(opts?: { onError?: () => void }): void {
  onError = (opts && opts.onError) || null;
}

export function saveDraft(text: string): void {
  const seq = ++saveSeq;
  if (text.length <= LS_TIER_MAX) saveSmall(text, seq);
  else saveLarge(text, seq);
}

export function flushDraft(): Promise<void> {
  if (idbTimer) clearTimeout(idbTimer);
  idbTimer = null;
  if (pendingText == null) return Promise.resolve();
  const text = pendingText;
  const seq = pendingSeq;
  pendingText = null;
  lastIdbWrite = Date.now();
  return writeLarge(text, seq).catch(reportError);
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

function saveSmall(text: string, seq: number): void {
  cancelQueuedLarge();
  try {
    localStorage.setItem(TEXT_KEY, text);
    setTier("ls");
    idbDelete(IDB_TEXT_KEY).catch(() => {});
  } catch (_) {
    writeLarge(text, seq).catch(reportError);
  }
}

function saveLarge(text: string, seq: number): void {
  pendingText = text;
  pendingSeq = seq;
  const wait = lastIdbWrite + IDB_THROTTLE_MS - Date.now();
  if (wait <= 0) {
    flushDraft();
    return;
  }
  if (!idbTimer) idbTimer = setTimeout(flushDraft, wait);
}

function writeLarge(text: string, seq: number): Promise<void> {
  return idbSet(IDB_TEXT_KEY, text).then(() => {
    if (seq !== saveSeq) return;
    setTier("idb");
    try {
      localStorage.removeItem(TEXT_KEY);
    } catch (_) {}
  });
}

function cancelQueuedLarge(): void {
  if (idbTimer) clearTimeout(idbTimer);
  idbTimer = null;
  pendingText = null;
}

function reportError(): void {
  if (onError) onError();
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(TEXT_KEY);
  } catch (_) {
    return null;
  }
}

function setTier(tier: "ls" | "idb"): void {
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch (_) {}
}

function getTier(): string | null {
  try {
    return localStorage.getItem(TIER_KEY);
  } catch (_) {
    return null;
  }
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

const idbGet = (key: string) =>
  idbRequest("readonly", (store) => store.get(key) as IDBRequest<unknown>);
const idbSet = (key: string, value: string) =>
  idbRequest("readwrite", (store) => store.put(value, key));
const idbDelete = (key: string) =>
  idbRequest("readwrite", (store) => store.delete(key));
