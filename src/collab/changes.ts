import * as Y from "yjs";
import { cleanName } from "./safetext.ts";
import { MAX_NAME, type Profile } from "./profile.ts";

export interface ChangeAuthor {
  readonly name: string;
  readonly color: number;
}

export interface Change {
  readonly key: string;
  readonly path: string | null;
  readonly from: number;
  readonly inserted: string;
  readonly removed: string;
  readonly author: ChangeAuthor | null;
  readonly before: string;
  readonly after: string;
}

export interface Baseline {
  readonly snapshot: Y.Snapshot;
  readonly accepted: ReadonlySet<string>;
}

interface YChange {
  readonly type: "added" | "removed";
  readonly key: string;
  readonly client: number;
}

interface DeltaOp {
  readonly insert?: unknown;
  readonly attributes?: { readonly ychange?: YChange };
}

const AUTHORS = "authors";
const CONTEXT = 30;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function registerAuthor(doc: Y.Doc, profile: Profile): void {
  const authors = doc.getMap<{ n: string; c: number }>(AUTHORS);
  const key = String(doc.clientID);
  const known = authors.get(key);
  if (known?.n === profile.name && known.c === profile.color) return;
  authors.set(key, { n: profile.name, c: profile.color });
}

function authorOf(doc: Y.Doc, client: number): ChangeAuthor | null {
  const entry = doc.getMap<unknown>(AUTHORS).get(String(client));
  if (!entry || typeof entry !== "object") return null;
  const { n, c } = entry as { n?: unknown; c?: unknown };
  return typeof n === "string" && Number.isInteger(c) && (c as number) >= 0
    ? { name: cleanName(n, MAX_NAME), color: c as number }
    : null;
}

interface Draft {
  key: string;
  from: number;
  inserted: string;
  removed: string;
  client: number | null;
}

function draftsOf(ops: readonly DeltaOp[]): Draft[] {
  const out: Draft[] = [];
  let at = 0;
  let open: Draft | null = null;
  for (const op of ops) {
    const piece = typeof op.insert === "string" ? op.insert : "";
    const change = op.attributes?.ychange;
    if (!change) {
      open = null;
      at += piece.length;
      continue;
    }
    if (
      open &&
      change.type === "added" &&
      open.client !== null &&
      open.client !== change.client
    )
      open = null;
    if (!open) {
      open = {
        key: change.key,
        from: at,
        inserted: "",
        removed: "",
        client: null,
      };
      out.push(open);
    }
    if (change.type === "added") {
      open.inserted += piece;
      open.client ??= change.client;
      at += piece.length;
    } else open.removed += piece;
  }
  return out;
}

export function changesOf(
  doc: Y.Doc,
  texts: ReadonlyMap<string | null, Y.Text>,
  base: Baseline,
): Change[] {
  const now = Y.snapshot(doc);
  const out: Change[] = [];
  for (const [path, text] of texts) {
    const ops = text.toDelta(now, base.snapshot, (type, id) => ({
      type,
      key: (path ?? "") + "@" + id.client + ":" + id.clock,
      client: id.client,
    })) as DeltaOp[];
    const value = text.toString();
    for (const draft of draftsOf(ops)) {
      if (
        draft.inserted === draft.removed ||
        base.accepted.has(acceptKey(draft))
      )
        continue;
      const end = draft.from + draft.inserted.length;
      out.push({
        key: draft.key,
        path,
        from: draft.from,
        inserted: draft.inserted,
        removed: draft.removed,
        author: draft.client === null ? null : authorOf(doc, draft.client),
        before: value.slice(Math.max(0, draft.from - CONTEXT), draft.from),
        after: value.slice(end, end + CONTEXT),
      });
    }
  }
  return out;
}

export function acceptKey(
  change: Pick<Change, "key" | "inserted" | "removed">,
): string {
  return (
    change.key + "|" + change.inserted.length + "|" + change.removed.length
  );
}

export function rejectChange(text: Y.Text, change: Change): void {
  text.doc!.transact(() => {
    if (change.inserted) text.delete(change.from, change.inserted.length);
    if (change.removed) text.insert(change.from, change.removed);
  });
}

export function freshBaseline(doc: Y.Doc): Baseline {
  return { snapshot: Y.snapshot(doc), accepted: new Set() };
}

export function encodeBaseline(base: Baseline): Uint8Array {
  const snapshot = Y.encodeSnapshot(base.snapshot);
  const accepted = encoder.encode(JSON.stringify([...base.accepted]));
  const out = new Uint8Array(4 + snapshot.byteLength + accepted.byteLength);
  new DataView(out.buffer).setUint32(0, snapshot.byteLength);
  out.set(snapshot, 4);
  out.set(accepted, 4 + snapshot.byteLength);
  return out;
}

export function decodeBaseline(bytes: Uint8Array): Baseline | null {
  try {
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(0);
    const snapshot = Y.decodeSnapshot(bytes.subarray(4, 4 + size));
    const list: unknown = JSON.parse(decoder.decode(bytes.subarray(4 + size)));
    const accepted = Array.isArray(list)
      ? list.filter((key): key is string => typeof key === "string")
      : [];
    return { snapshot, accepted: new Set(accepted) };
  } catch {
    return null;
  }
}
