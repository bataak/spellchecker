import type * as Y from "yjs";
import { noteError } from "../core/errorlog.ts";
import {
  addBlob,
  blobHash,
  fileIds,
  MAX_BLOB,
  movePath,
  blobsOf,
  removePath,
  setBlob,
  sharedPath,
  type BlobRef,
} from "./projectdoc.ts";
import { BRIDGE } from "./projectbridge.ts";
import { SwapClosed } from "./blobswap.ts";

export interface BlobPort {
  binaries(): ReadonlyMap<string, Uint8Array> | null;
  main(): string | null;
  put(path: string, bytes: Uint8Array): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface BlobBridge {
  start(): Promise<void>;
  pushLocal(): Promise<void>;
  have(hash: string): Promise<Uint8Array | null>;
  stop(): void;
}

type Want = (hash: string, size: number) => Promise<Uint8Array>;

const hashes = new WeakMap<Uint8Array, string>();

async function hashOf(bytes: Uint8Array): Promise<string> {
  const known = hashes.get(bytes);
  if (known) return known;
  const hash = await blobHash(bytes);
  hashes.set(bytes, hash);
  return hash;
}

function blobIds(doc: Y.Doc, blobs: ReadonlyMap<string, BlobRef>) {
  const out = new Map<string, string>();
  for (const [path, id] of fileIds(doc)) if (blobs.has(path)) out.set(path, id);
  return out;
}

async function localHashes(
  port: BlobPort,
): Promise<Map<string, string> | null> {
  const binaries = port.binaries();
  if (!binaries) return null;
  const main = port.main();
  const out = new Map<string, string>();
  for (const [path, bytes] of binaries)
    if (sharedPath(path, main) && bytes.byteLength <= MAX_BLOB)
      out.set(path, await hashOf(bytes));
  return out;
}

async function haveIn(
  port: BlobPort,
  hash: string,
): Promise<Uint8Array | null> {
  for (const bytes of port.binaries()?.values() ?? [])
    if (bytes.byteLength <= MAX_BLOB && (await hashOf(bytes)) === hash)
      return bytes;
  return null;
}

function writeLocal(
  doc: Y.Doc,
  local: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
  sizeOf: (path: string) => number,
): void {
  const added = [...now.keys()].filter((path) => !local.has(path));
  const docBlobs = blobsOf(doc);
  doc.transact(() => {
    for (const [path, hash] of local) {
      if (now.has(path)) {
        if (now.get(path) !== hash)
          setBlob(doc, path, { hash: now.get(path)!, size: sizeOf(path) });
        continue;
      }
      const at = added.findIndex((to) => now.get(to) === hash);
      if (at >= 0 && docBlobs.has(path)) {
        movePath(doc, path, added[at]!);
        added.splice(at, 1);
      } else if (docBlobs.has(path)) removePath(doc, path);
    }
    for (const path of added) {
      const ref = { hash: now.get(path)!, size: sizeOf(path) };
      if (!docBlobs.has(path)) addBlob(doc, path, ref);
    }
  }, BRIDGE);
}

function unlessClosed(error: unknown): void {
  if (!(error instanceof SwapClosed)) noteError(error);
}

function synced(
  doc: Y.Doc,
  now: ReadonlyMap<string, string>,
): Map<string, string> {
  const docBlobs = blobsOf(doc);
  return new Map(
    [...now].filter(([path, hash]) => docBlobs.get(path)?.hash === hash),
  );
}

function withMissing(
  doc: Y.Doc,
  local: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
): Map<string, string> {
  const docBlobs = blobsOf(doc);
  const out = new Map(local);
  for (const [path, hash] of now) if (!docBlobs.has(path)) out.set(path, hash);
  return out;
}

export function createBlobBridge(
  doc: Y.Doc,
  port: BlobPort,
  want: Want,
): BlobBridge {
  let local = new Map<string, string>();
  let seen: ReadonlyMap<string, BlobRef> = new Map();
  let ids = new Map<string, string>();
  let queue: Promise<void> = Promise.resolve();
  let started = false;
  let stopped = false;

  const run = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(() => (stopped ? undefined : task())).catch(noteError);
    return queue;
  };

  const remember = (): void => {
    seen = blobsOf(doc);
    ids = blobIds(doc, seen);
  };

  const sizeOf = (path: string): number =>
    port.binaries()?.get(path)?.byteLength ?? 0;

  const place = (path: string, ref: BlobRef, bytes: Uint8Array) =>
    run(async () => {
      if (blobsOf(doc).get(path)?.hash !== ref.hash) return;
      if (local.get(path) === ref.hash) return;
      hashes.set(bytes, ref.hash);
      await port.put(path, bytes);
      local.set(path, ref.hash);
    });

  const fetch = async (path: string, ref: BlobRef): Promise<void> => {
    const ready = await haveIn(port, ref.hash);
    if (ready) {
      await port.put(path, ready);
      local.set(path, ref.hash);
      return;
    }
    want(ref.hash, ref.size).then(
      (bytes) => place(path, ref, bytes),
      unlessClosed,
    );
  };

  const applyRemote = async (): Promise<void> => {
    if (!port.binaries()) return remember();
    const before = seen;
    const pathOfId = new Map([...ids].map(([path, id]) => [id, path]));
    remember();
    const moved = new Set<string>();
    for (const [path, id] of ids) {
      const from = pathOfId.get(id);
      if (!from || from === path || !local.has(from)) continue;
      moved.add(from);
      await port.move(from, path);
      local.set(path, local.get(from)!);
      local.delete(from);
    }
    for (const path of before.keys())
      if (!seen.has(path) && !moved.has(path) && local.has(path)) {
        await port.remove(path);
        local.delete(path);
      }
    for (const [path, ref] of seen)
      if (local.get(path) !== ref.hash) await fetch(path, ref);
  };

  const onUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin !== BRIDGE && started) void run(applyRemote);
  };

  const pushLocal = (): Promise<void> =>
    run(async () => {
      if (!started) return;
      const now = await localHashes(port);
      if (!now) return;
      writeLocal(doc, local, now, sizeOf);
      local = now;
      remember();
    });

  return {
    start: () =>
      run(async () => {
        if (started) return;
        const now = (await localHashes(port)) ?? new Map<string, string>();
        local = synced(doc, now);
        started = true;
        doc.on("update", onUpdate);
        seen = new Map();
        ids = new Map();
        await applyRemote();
        const next = withMissing(doc, local, now);
        writeLocal(doc, local, next, sizeOf);
        local = next;
        remember();
      }),
    pushLocal,
    have: (hash) => haveIn(port, hash),
    stop() {
      stopped = true;
      doc.off("update", onUpdate);
    },
  };
}
