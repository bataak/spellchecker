const TEXT_KEY = "mn-spell:text";
const TIER_KEY = "mn-spell:tier";
const IDB_TEXT_KEY = "text";
const LS_TIER_MAX = 1000000;
const IDB_THROTTLE_MS = 3000;
const DB_NAME = "mn-spell";
const STORE_NAME = "kv";

let dbPromise = null;
let onError = null;
let saveSeq = 0;
let pendingText = null;
let pendingSeq = 0;
let idbTimer = null;
let lastIdbWrite = 0;

export function initDraftStorage(opts) {
  onError = (opts && opts.onError) || null;
}

export function saveDraft(text) {
  const seq = ++saveSeq;
  if (text.length <= LS_TIER_MAX) saveSmall(text, seq);
  else saveLarge(text, seq);
}

export function flushDraft() {
  clearTimeout(idbTimer);
  idbTimer = null;
  if (pendingText == null) return Promise.resolve();
  const text = pendingText;
  const seq = pendingSeq;
  pendingText = null;
  lastIdbWrite = Date.now();
  return writeLarge(text, seq).catch(reportError);
}

export function loadDraft() {
  if (getTier() === "idb") {
    return idbGet(IDB_TEXT_KEY)
      .then((t) => (t != null ? t : readLocal()))
      .catch(readLocal);
  }
  return Promise.resolve(readLocal());
}

function saveSmall(text, seq) {
  cancelQueuedLarge();
  try {
    localStorage.setItem(TEXT_KEY, text);
    setTier("ls");
    idbDelete(IDB_TEXT_KEY).catch(() => {});
  } catch (_) {
    writeLarge(text, seq).catch(reportError);
  }
}

function saveLarge(text, seq) {
  pendingText = text;
  pendingSeq = seq;
  const wait = lastIdbWrite + IDB_THROTTLE_MS - Date.now();
  if (wait <= 0) {
    flushDraft();
    return;
  }
  if (!idbTimer) idbTimer = setTimeout(flushDraft, wait);
}

function writeLarge(text, seq) {
  return idbSet(IDB_TEXT_KEY, text).then(() => {
    if (seq !== saveSeq) return;
    setTier("idb");
    try {
      localStorage.removeItem(TEXT_KEY);
    } catch (_) {}
  });
}

function cancelQueuedLarge() {
  clearTimeout(idbTimer);
  idbTimer = null;
  pendingText = null;
}

function reportError() {
  if (onError) onError();
}

function readLocal() {
  try {
    return localStorage.getItem(TEXT_KEY);
  } catch (_) {
    return null;
  }
}

function setTier(tier) {
  try {
    localStorage.setItem(TIER_KEY, tier);
  } catch (_) {}
}

function getTier() {
  try {
    return localStorage.getItem(TIER_KEY);
  } catch (_) {
    return null;
  }
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = run(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const idbGet = (key) => idbRequest("readonly", (s) => s.get(key));
const idbSet = (key, value) =>
  idbRequest("readwrite", (s) => s.put(value, key));
const idbDelete = (key) => idbRequest("readwrite", (s) => s.delete(key));
