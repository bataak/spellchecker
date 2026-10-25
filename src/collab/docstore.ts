import * as Y from "yjs";
import { openDatabase, requestResult } from "../core/idb.ts";
import { noteError } from "../core/errorlog.ts";
import { seedProjectDoc, type ProjectHooks } from "./projectsession.ts";

export const LOADED = { load: true };

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

interface OpenedDoc {
  readonly doc: Y.Doc;
  readonly fresh: boolean;
}

export async function openDoc(
  room: string,
  seed: (() => string) | null,
  project: ProjectHooks | null,
): Promise<OpenedDoc> {
  const doc = new Y.Doc();
  const stored = await loadDoc(room);
  if (stored) Y.applyUpdate(doc, stored, LOADED);
  if (project) {
    const seeded = await seedProjectDoc(doc, project);
    return { doc, fresh: !stored && !seeded };
  }
  const text = doc.getText("t");
  if (seed && text.length === 0) text.insert(0, seed());
  return { doc, fresh: !stored && !seed };
}
