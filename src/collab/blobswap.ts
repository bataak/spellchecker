import {
  BLOB_NONE,
  BLOB_PART,
  BLOB_WANT,
  encodeFrame,
  type BlobKind,
} from "./wire.ts";
import { blobHash, MAX_BLOB } from "./projectdoc.ts";

export interface BlobTransport {
  send(peer: string, data: Uint8Array): void;
  open(): string[];
  drain(peer: string): Promise<void>;
}

export interface BlobSwapDeps {
  readonly transport: BlobTransport;
  readonly have: (hash: string) => Promise<Uint8Array | null>;
}

export interface BlobSwap {
  want(hash: string, size: number): Promise<Uint8Array>;
  receive(peer: string, kind: BlobKind, body: Uint8Array): void;
  joined(peer: string): void;
  close(): void;
}

interface Wanted {
  readonly hash: string;
  readonly size: number;
  readonly asked: Set<string>;
  readonly done: (bytes: Uint8Array) => void;
  readonly promise: Promise<Uint8Array>;
  parts: (Uint8Array | undefined)[];
  peer: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export const PART_BYTES = 192 * 1024;
const HASH_CHARS = 64;
const HEADER = HASH_CHARS + 8;
const STALL_MS = 15_000;
const HASH = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function partFrame(
  hash: string,
  index: number,
  total: number,
  data: Uint8Array,
): Uint8Array {
  const body = new Uint8Array(HEADER + data.byteLength);
  body.set(encoder.encode(hash));
  const view = new DataView(body.buffer);
  view.setUint32(HASH_CHARS, index);
  view.setUint32(HASH_CHARS + 4, total);
  body.set(data, HEADER);
  return encodeFrame(BLOB_PART, body);
}

export function parsePart(
  body: Uint8Array,
): { hash: string; index: number; total: number; data: Uint8Array } | null {
  if (body.byteLength < HEADER) return null;
  const hash = decoder.decode(body.subarray(0, HASH_CHARS));
  if (!HASH.test(hash)) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const index = view.getUint32(HASH_CHARS);
  const total = view.getUint32(HASH_CHARS + 4);
  if (total === 0 || index >= total) return null;
  return { hash, index, total, data: body.subarray(HEADER) };
}

function joined(parts: readonly (Uint8Array | undefined)[]): Uint8Array {
  let size = 0;
  for (const part of parts) size += part!.byteLength;
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part!, at);
    at += part!.byteLength;
  }
  return out;
}

function hashFrame(kind: BlobKind, hash: string): Uint8Array {
  return encodeFrame(kind, encoder.encode(hash));
}

async function streamBlob(
  transport: BlobTransport,
  peer: string,
  hash: string,
  bytes: Uint8Array,
  closed: () => boolean,
): Promise<void> {
  const total = Math.max(1, Math.ceil(bytes.byteLength / PART_BYTES));
  for (let index = 0; index < total; index++) {
    if (closed() || !transport.open().includes(peer)) return;
    await transport.drain(peer);
    const from = index * PART_BYTES;
    const data = bytes.subarray(from, from + PART_BYTES);
    transport.send(peer, partFrame(hash, index, total, data));
  }
}

export function createBlobSwap(deps: BlobSwapDeps): BlobSwap {
  const { transport } = deps;
  const wanted = new Map<string, Wanted>();
  const sending = new Map<string, Promise<void>>();
  let closed = false;

  const ask = (entry: Wanted): void => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.parts = [];
    if (closed) return;
    const open = transport.open();
    const peer = open.find((candidate) => !entry.asked.has(candidate));
    entry.peer = peer ?? null;
    if (!peer) {
      entry.asked.clear();
      if (open.length) entry.timer = setTimeout(() => ask(entry), STALL_MS);
      return;
    }
    entry.asked.add(peer);
    entry.timer = setTimeout(() => ask(entry), STALL_MS);
    transport.send(peer, hashFrame(BLOB_WANT, entry.hash));
  };

  const serve = async (peer: string, hash: string): Promise<void> => {
    const bytes = HASH.test(hash) ? await deps.have(hash) : null;
    if (closed) return;
    if (!bytes) return transport.send(peer, hashFrame(BLOB_NONE, hash));
    const queued = (sending.get(peer) ?? Promise.resolve())
      .then(() => streamBlob(transport, peer, hash, bytes, () => closed))
      .catch(() => {});
    sending.set(peer, queued);
  };

  const finish = async (entry: Wanted): Promise<void> => {
    const bytes = joined(entry.parts);
    if (
      bytes.byteLength === entry.size &&
      (await blobHash(bytes)) === entry.hash
    ) {
      if (entry.timer) clearTimeout(entry.timer);
      wanted.delete(entry.hash);
      entry.done(bytes);
      return;
    }
    ask(entry);
  };

  const take = (peer: string, body: Uint8Array): void => {
    const part = parsePart(body);
    const entry = part && wanted.get(part.hash);
    if (!part || !entry || entry.peer !== peer) return;
    if (part.total * PART_BYTES > entry.size + PART_BYTES) return ask(entry);
    entry.parts[part.index] = part.data.slice();
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => ask(entry), STALL_MS);
    for (let index = 0; index < part.total; index++)
      if (!entry.parts[index]) return;
    entry.parts.length = part.total;
    void finish(entry);
  };

  return {
    want(hash, size) {
      const known = wanted.get(hash);
      if (known) return known.promise;
      if (!HASH.test(hash) || size > MAX_BLOB)
        return Promise.reject(new Error("blob"));
      let done: (bytes: Uint8Array) => void = () => {};
      const promise = new Promise<Uint8Array>((resolve) => (done = resolve));
      const entry: Wanted = {
        hash,
        size,
        asked: new Set(),
        done,
        promise,
        parts: [],
        peer: null,
        timer: null,
      };
      wanted.set(hash, entry);
      ask(entry);
      return promise;
    },
    receive(peer, kind, body) {
      if (kind === BLOB_PART) return take(peer, body);
      const hash = decoder.decode(body);
      if (kind === BLOB_WANT) return void serve(peer, hash).catch(() => {});
      const entry = wanted.get(hash);
      if (entry?.peer === peer) ask(entry);
    },
    joined() {
      for (const entry of wanted.values()) if (!entry.peer) ask(entry);
    },
    close() {
      closed = true;
      for (const entry of wanted.values())
        if (entry.timer) clearTimeout(entry.timer);
      wanted.clear();
    },
  };
}
