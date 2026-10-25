import * as Y from "yjs";
import { deflateSync } from "fflate";
import { seal } from "./collabkey.ts";
import { saveDoc } from "./docstore.ts";

const SAVE_MS = 2000;
const UPLOAD_IDLE_MS = 30_000;
const UPLOAD_GAP_MS = 5 * 60_000;
const MAX_UPLOAD = 8 * 1024 * 1024;
const NEAR_UPLOAD = 6 * 1024 * 1024;

export type UploadNotice = "too-large" | "near-limit";

export function isUploader(
  self: string,
  room: ReadonlySet<string>,
  open: readonly string[],
): boolean {
  let leader = self;
  for (const peer of room) if (peer < leader) leader = peer;
  return leader === self || !open.includes(leader);
}

export function uploadAt(
  now: number,
  dirtySince: number,
  last: number,
): number {
  const due = Math.min(now + UPLOAD_IDLE_MS, dirtySince + UPLOAD_GAP_MS);
  return last ? Math.max(due, last + UPLOAD_GAP_MS) : due;
}

export interface Uploader {
  mark(): void;
  schedule(): void;
  run(): Promise<void>;
  force(): void;
  dirty(): boolean;
  cancel(): void;
}

export interface UploaderDeps {
  readonly doc: Y.Doc;
  readonly key: CryptoKey;
  readonly allowed: () => boolean;
  readonly send: (data: Uint8Array) => boolean;
  readonly notice: (notice: UploadNotice) => void;
}

export function createUploader(deps: UploaderDeps, dirty: boolean): Uploader {
  let last = 0;
  let dirtySince = dirty ? Date.now() : 0;
  const warned = new Set<UploadNotice>();
  let edits = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const warn = (notice: UploadNotice): void => {
    if (!warned.has(notice)) deps.notice(notice);
    warned.add(notice);
  };
  const run = async (): Promise<void> => {
    cancel();
    if (!dirty || !deps.allowed()) return;
    const seen = edits;
    const state = deflateSync(Y.encodeStateAsUpdate(deps.doc));
    const sealed = await seal(deps.key, state);
    if (sealed.byteLength > MAX_UPLOAD) return warn("too-large");
    if (sealed.byteLength > NEAR_UPLOAD) warn("near-limit");
    if (!deps.send(sealed)) return;
    last = Date.now();
    if (edits !== seen) return;
    dirty = false;
  };
  const schedule = (): void => {
    cancel();
    const now = Date.now();
    timer = setTimeout(() => void run(), uploadAt(now, dirtySince, last) - now);
  };
  return {
    mark() {
      if (!dirty) dirtySince = Date.now();
      dirty = true;
      edits++;
      schedule();
    },
    schedule() {
      if (dirty) schedule();
    },
    run,
    force() {
      if (!dirty) dirtySince = Date.now();
      dirty = true;
      edits++;
      cancel();
      void run();
    },
    dirty: () => dirty,
    cancel,
  };
}

export interface Saver {
  soon(): void;
  now(): Promise<void>;
  cancel(): void;
}

export function createSaver(doc: Y.Doc, room: string): Saver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    return saveDoc(room, Y.encodeStateAsUpdate(doc));
  };
  return {
    soon() {
      timer ??= setTimeout(() => void now(), SAVE_MS);
    },
    now: () => (timer ? now() : Promise.resolve()),
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export function whenHidden(run: () => void): () => void {
  const flush = (): void => {
    if (document.visibilityState === "hidden") run();
  };
  document.addEventListener("visibilitychange", flush);
  return () => document.removeEventListener("visibilitychange", flush);
}

export function flushWhenHidden(saver: Saver, uploader: Uploader): () => void {
  return whenHidden(() => {
    void saver.now();
    if (uploader.dirty()) void uploader.run();
  });
}
