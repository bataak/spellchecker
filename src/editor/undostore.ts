import { type History } from "./undomodel.ts";
import { noteError } from "../core/errorlog.ts";
import { isFileSlot, PROJECT_SLOT } from "../core/fileslots.ts";
import { databaseOpener } from "../core/idb.ts";

export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ":" + text.length.toString(36);
}

export interface Stored {
  slot: string;
  history: History;
  sum: string;
  savedAt: number;
}

const DB_NAME = "bichig-undo";

const STORE = "history";

const openDb = databaseOpener(DB_NAME, (db) =>
  db.createObjectStore(STORE, { keyPath: "slot" }),
);

function done(request: IDBRequest): Promise<void> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function loadStored(slot: string): Promise<Stored | null> {
  try {
    const db = await openDb();
    const request = db.transaction(STORE).objectStore(STORE).get(slot);
    await done(request);
    return (request.result as Stored | undefined) ?? null;
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function storedHistoryTexts(): Promise<string[]> {
  try {
    const db = await openDb();
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    await done(request);
    const out: string[] = [];
    for (const entry of (request.result as Stored[] | undefined) ?? [])
      for (const step of [...entry.history.undo, ...entry.history.redo])
        out.push(step.removed, step.inserted);
    return out;
  } catch (error) {
    noteError(error);
    return [];
  }
}

export const HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface HistoryScope {
  readonly files: ReadonlySet<string>;
  readonly project: {
    readonly pending: boolean;
    readonly files: readonly string[];
  } | null;
  readonly now: number;
}

export function keepHistory(
  slot: string,
  savedAt: number,
  scope: HistoryScope,
): boolean {
  if (scope.now - savedAt > HISTORY_MAX_AGE_MS) return false;
  const [base = "", path] = slot.split("\u0000");
  if (isFileSlot(base)) return scope.files.has(base);
  if (base !== PROJECT_SLOT || path === undefined) return true;
  if (!scope.project) return false;
  return scope.project.pending || scope.project.files.includes(path);
}

export function pruneUndo(
  slots: readonly { readonly id: string }[],
  project: HistoryScope["project"],
): Promise<number> {
  return pruneHistories({
    files: new Set(slots.map((slot) => slot.id)),
    project,
    now: Date.now(),
  });
}

export async function pruneHistories(scope: HistoryScope): Promise<number> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const request = store.getAll();
    await done(request);
    let dropped = 0;
    for (const entry of (request.result as Stored[] | undefined) ?? []) {
      if (keepHistory(entry.slot, entry.savedAt, scope)) continue;
      store.delete(entry.slot);
      dropped += 1;
    }
    return dropped;
  } catch (error) {
    noteError(error);
    return 0;
  }
}

export async function dropStored(slot: string): Promise<void> {
  try {
    const db = await openDb();
    await done(
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(slot),
    );
  } catch (error) {
    noteError(error);
  }
}

export async function saveStored(entry: Stored): Promise<void> {
  try {
    const db = await openDb();
    await done(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(entry),
    );
  } catch (error) {
    noteError(error);
  }
}
