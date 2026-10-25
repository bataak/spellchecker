import * as Y from "yjs";
import {
  BLOB_NONE,
  BLOB_WANT,
  CHAT_REQUEST,
  CHAT_UPDATE,
  CURSOR,
  LINKS,
  SYNC_REQUEST,
  SYNC_UPDATE,
  decodeFrame,
  encodeFrame,
  type BlobKind,
  type FrameKind,
} from "./wire.ts";

export interface SyncDeps {
  readonly doc: Y.Doc;
  readonly chat?: Y.Doc;
  readonly open: () => string[];
  readonly send: (peer: string, data: Uint8Array) => void;
  readonly onCursor: (peer: string, body: Uint8Array) => void;
  readonly onBlob?: (peer: string, kind: BlobKind, body: Uint8Array) => void;
  readonly onJoined?: (peer: string) => void;
}

export interface Sync {
  joined(peer: string): void;
  left(peer: string): void;
  receive(peer: string, data: Uint8Array): void;
  linksChanged(): void;
  cursor(body: Uint8Array): void;
  close(): void;
}

interface PeerOrigin {
  readonly peer: string;
}

const BATCH_MS = 30;
export const MAX_CHAT_UPDATE = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function relayTargets(
  open: readonly string[],
  origin: string,
  originLinks: ReadonlySet<string> | undefined,
): string[] {
  return open.filter((peer) => peer !== origin && !originLinks?.has(peer));
}

export function parseLinks(body: Uint8Array): Set<string> {
  try {
    const value: unknown = JSON.parse(decoder.decode(body));
    return new Set(
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function peerOf(origin: unknown): string | null {
  return origin && typeof origin === "object" && "peer" in origin
    ? (origin as PeerOrigin).peer
    : null;
}

interface Lane {
  joined(peer: string): void;
  receive(peer: string, kind: FrameKind, body: Uint8Array): boolean;
  close(): void;
}

interface LaneKinds {
  readonly request: FrameKind;
  readonly update: FrameKind;
  readonly limit: number;
}

function createLane(
  doc: Y.Doc,
  kinds: LaneKinds,
  deps: SyncDeps,
  peerLinks: ReadonlyMap<string, Set<string>>,
): Lane {
  let pending: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const broadcast = (data: Uint8Array, targets: readonly string[]): void => {
    for (const peer of targets) deps.send(peer, data);
  };
  const flush = (): void => {
    timer = null;
    if (!pending.length) return;
    const merged = pending.length === 1 ? pending[0]! : Y.mergeUpdates(pending);
    pending = [];
    broadcast(encodeFrame(kinds.update, merged), deps.open());
  };
  const onUpdate = (update: Uint8Array, origin: unknown): void => {
    const from = peerOf(origin);
    if (from !== null) {
      const targets = relayTargets(deps.open(), from, peerLinks.get(from));
      if (targets.length) broadcast(encodeFrame(kinds.update, update), targets);
      return;
    }
    pending.push(update);
    timer ??= setTimeout(flush, BATCH_MS);
  };
  doc.on("update", onUpdate);
  return {
    joined(peer) {
      deps.send(peer, encodeFrame(kinds.request, Y.encodeStateVector(doc)));
    },
    receive(peer, kind, body) {
      if (kind === kinds.request)
        deps.send(
          peer,
          encodeFrame(kinds.update, Y.encodeStateAsUpdate(doc, body)),
        );
      else if (kind !== kinds.update) return false;
      else if (body.byteLength <= kinds.limit)
        Y.applyUpdate(doc, body, { peer } satisfies PeerOrigin);
      return true;
    },
    close() {
      if (timer) clearTimeout(timer);
      flush();
      doc.off("update", onUpdate);
    },
  };
}

export function createSync(deps: SyncDeps): Sync {
  const peerLinks = new Map<string, Set<string>>();
  const lanes = [
    createLane(
      deps.doc,
      { request: SYNC_REQUEST, update: SYNC_UPDATE, limit: Infinity },
      deps,
      peerLinks,
    ),
  ];
  if (deps.chat)
    lanes.push(
      createLane(
        deps.chat,
        { request: CHAT_REQUEST, update: CHAT_UPDATE, limit: MAX_CHAT_UPDATE },
        deps,
        peerLinks,
      ),
    );

  const broadcast = (data: Uint8Array): void => {
    for (const peer of deps.open()) deps.send(peer, data);
  };
  const announceLinks = (): void => {
    broadcast(encodeFrame(LINKS, encoder.encode(JSON.stringify(deps.open()))));
  };

  return {
    joined(peer) {
      for (const lane of lanes) lane.joined(peer);
      announceLinks();
      deps.onJoined?.(peer);
    },
    left(peer) {
      peerLinks.delete(peer);
      announceLinks();
    },
    receive(peer, data) {
      const frame = decodeFrame(data);
      if (!frame) return;
      if (lanes.some((lane) => lane.receive(peer, frame.kind, frame.body)))
        return;
      if (frame.kind === LINKS) peerLinks.set(peer, parseLinks(frame.body));
      else if (frame.kind === CURSOR) deps.onCursor(peer, frame.body);
      else if (frame.kind >= BLOB_WANT && frame.kind <= BLOB_NONE)
        deps.onBlob?.(peer, frame.kind as BlobKind, frame.body);
    },
    linksChanged: announceLinks,
    cursor(body) {
      broadcast(encodeFrame(CURSOR, body));
    },
    close() {
      for (const lane of lanes) lane.close();
    },
  };
}
