import { ownValue, pathRecord } from "../core/pathrecord.ts";
import { dbGet, dbPut } from "./projectdb.ts";
import {
  editsOf,
  metaOf,
  savedFilesOf,
  type Meta,
  type State,
} from "./projectstate.ts";

const META_KEY = "meta";
const FILES_KEY = "files";
const EDITS_KEY = "edits";
const EDITS_DELAY_MS = 800;

export function storedMeta(): Promise<Meta | null> {
  return dbGet<Meta>(META_KEY);
}

export async function storedEdits(): Promise<Record<string, string>> {
  return (await dbGet<Record<string, string>>(EDITS_KEY)) ?? {};
}

export function storedFiles(): Promise<Record<string, Uint8Array> | null> {
  return dbGet<Record<string, Uint8Array>>(FILES_KEY);
}

async function mergedEdits(s: State): Promise<Record<string, string>> {
  const mine = editsOf(s);
  const stored = await storedMeta();
  if (stored?.uid !== s.uid) {
    s.persisted = mine;
    return mine;
  }
  const out = pathRecord(await storedEdits());
  for (const path of new Set([
    ...Object.keys(mine),
    ...Object.keys(s.persisted),
  ])) {
    const next = ownValue(mine, path);
    if (next === ownValue(s.persisted, path)) continue;
    if (next !== undefined) out[path] = next;
    else delete out[path];
  }
  s.persisted = mine;
  return out;
}

export interface Persist {
  save(withFiles?: boolean): Promise<void>;
  saveSoon(): void;
  dropFiles(): Promise<void>;
  clear(): void;
}

export function createPersist(current: () => State | null): Persist {
  let writing: Promise<void> = Promise.resolve();
  let timer = 0;

  function write(withFiles: boolean): Promise<void> {
    const run = async (): Promise<void> => {
      const s = current();
      if (!s) return;
      const edits = await mergedEdits(s);
      if (current() !== s) return;
      const entries: Record<string, unknown> = {
        [META_KEY]: metaOf(s),
        [EDITS_KEY]: edits,
      };
      if (withFiles && s.kind !== "dir") entries[FILES_KEY] = savedFilesOf(s);
      await dbPut(entries);
    };
    writing = writing.then(run, run);
    return writing;
  }

  function cancel(): void {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  function flush(): void {
    if (!timer) return;
    cancel();
    void write(false);
  }

  if (typeof window !== "undefined" && "addEventListener" in window) {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    save: (withFiles = false) => write(withFiles),
    saveSoon() {
      cancel();
      timer = window.setTimeout(() => {
        timer = 0;
        void write(false);
      }, EDITS_DELAY_MS);
    },
    dropFiles: () => dbPut({ [FILES_KEY]: undefined }),
    clear() {
      cancel();
      void dbPut({
        [META_KEY]: undefined,
        [EDITS_KEY]: undefined,
        [FILES_KEY]: undefined,
      });
    },
  };
}
