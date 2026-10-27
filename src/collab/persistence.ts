import * as Y from "yjs";
import { deflateSync } from "fflate";
import { seal } from "./collabkey.ts";
import { appendLog, compactLog, logKey, type StoredLog } from "./docstore.ts";

export const LOADED = { load: true };

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
  readonly encoded?: (state: Uint8Array) => void;
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
    const full = Y.encodeStateAsUpdate(deps.doc);
    deps.encoded?.(full);
    const state = deflateSync(full);
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
  compact(state?: Uint8Array): Promise<void>;
  cancel(): void;
  close(): Promise<void>;
}

export function applyLog(doc: Y.Doc, log: StoredLog): void {
  doc.transact(() => {
    if (log.base) Y.applyUpdate(doc, log.base);
    for (const update of log.updates) Y.applyUpdate(doc, update);
  }, LOADED);
}

export const LOG_COUNT = 200;
export const LOG_BYTES = 256 * 1024;

interface Logged {
  readonly key: string;
  readonly upTo: number;
}

interface SaverState {
  seq: number;
  pending: { readonly n: number; readonly update: Uint8Array }[];
  logged: Logged[];
  bytes: number;
  closed: boolean;
}

function saverState(keys: readonly string[]): SaverState {
  return {
    seq: 0,
    pending: [],
    logged: keys.map((key) => ({ key, upTo: 0 })),
    bytes: 0,
    closed: false,
  };
}

async function appendPending(st: SaverState, room: string): Promise<void> {
  const batch = st.pending.slice();
  if (!batch.length) return;
  const merged = Y.mergeUpdates(batch.map((item) => item.update));
  const key = logKey(room);
  if (!(await appendLog(key, merged))) return;
  const upTo = batch.at(-1)!.n;
  st.pending = st.pending.filter((item) => item.n > upTo);
  st.logged.push({ key, upTo });
  st.bytes += merged.byteLength;
}

async function compactTo(
  st: SaverState,
  room: string,
  state: Uint8Array,
  upTo: number,
): Promise<void> {
  const covered = st.logged.filter((log) => log.upTo <= upTo);
  const ok = await compactLog(
    room,
    state,
    covered.map((log) => log.key),
  );
  if (!ok) return;
  st.logged = st.logged.filter((log) => log.upTo > upTo);
  st.pending = st.pending.filter((item) => item.n > upTo);
  st.bytes = 0;
}

export function createSaver(
  doc: Y.Doc,
  room: string,
  keys: readonly string[],
  early: readonly Uint8Array[],
): Saver {
  const st = saverState(keys);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): Promise<void> =>
    (queue = queue.then(() => (st.closed ? undefined : task())));
  const track = (update: Uint8Array): void => {
    st.pending.push({ n: ++st.seq, update });
  };
  const compact = (given?: Uint8Array): Promise<void> => {
    const upTo = given ? st.seq : 0;
    return enqueue(() =>
      given
        ? compactTo(st, room, given, upTo)
        : compactTo(st, room, Y.encodeStateAsUpdate(doc), st.seq),
    );
  };
  const now = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    return enqueue(async () => {
      await appendPending(st, room);
      if (st.logged.length >= LOG_COUNT || st.bytes >= LOG_BYTES)
        await compactTo(st, room, Y.encodeStateAsUpdate(doc), st.seq);
    });
  };
  const soon = (): void => {
    timer ??= setTimeout(() => void now(), SAVE_MS);
  };
  for (const update of early) track(update);
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== LOADED) track(update);
  });
  if (keys.length) void compact();
  else if (early.length) soon();
  return {
    soon,
    now: () => (timer || st.pending.length ? now() : queue),
    compact,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      st.closed = true;
      await queue;
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
