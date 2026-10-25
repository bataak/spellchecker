import * as Y from "yjs";
import {
  BLOB_WANT,
  CURSOR,
  LINKS,
  SYNC_REQUEST,
  SYNC_UPDATE,
  decodeFrame,
  encodeFrame,
  type BlobKind,
} from "./wire.ts";

export interface SyncDeps {
  readonly doc: Y.Doc;
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

export function createSync(deps: SyncDeps): Sync {
  const { doc } = deps;
  const peerLinks = new Map<string, Set<string>>();
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
    broadcast(encodeFrame(SYNC_UPDATE, merged), deps.open());
  };

  const onUpdate = (update: Uint8Array, origin: unknown): void => {
    const from = peerOf(origin);
    if (from !== null) {
      const targets = relayTargets(deps.open(), from, peerLinks.get(from));
      if (targets.length) broadcast(encodeFrame(SYNC_UPDATE, update), targets);
      return;
    }
    pending.push(update);
    timer ??= setTimeout(flush, BATCH_MS);
  };
  doc.on("update", onUpdate);

  const announceLinks = (): void => {
    const body = encoder.encode(JSON.stringify(deps.open()));
    broadcast(encodeFrame(LINKS, body), deps.open());
  };

  return {
    joined(peer) {
      deps.send(peer, encodeFrame(SYNC_REQUEST, Y.encodeStateVector(doc)));
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
      if (frame.kind === SYNC_REQUEST)
        deps.send(
          peer,
          encodeFrame(SYNC_UPDATE, Y.encodeStateAsUpdate(doc, frame.body)),
        );
      else if (frame.kind === SYNC_UPDATE)
        Y.applyUpdate(doc, frame.body, { peer } satisfies PeerOrigin);
      else if (frame.kind === LINKS)
        peerLinks.set(peer, parseLinks(frame.body));
      else if (frame.kind === CURSOR) deps.onCursor(peer, frame.body);
      else if (frame.kind >= BLOB_WANT)
        deps.onBlob?.(peer, frame.kind as BlobKind, frame.body);
    },
    linksChanged: announceLinks,
    cursor(body) {
      broadcast(encodeFrame(CURSOR, body), deps.open());
    },
    close() {
      if (timer) clearTimeout(timer);
      flush();
      doc.off("update", onUpdate);
    },
  };
}
