import type * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { docKey, loadDoc, saveDoc } from "./docstore.ts";
import {
  acceptKey,
  changesOf,
  decodeBaseline,
  encodeBaseline,
  freshBaseline,
  type Baseline,
  type Change,
} from "./changes.ts";
import {
  decodeRejected,
  encodeRejected,
  MAX_REJECTED,
  rejectAnchored,
  restoreRejected,
  type RejectedChange,
} from "./rejects.ts";

export type { RejectedChange } from "./rejects.ts";

export interface ChangeTracker {
  list(): readonly Change[];
  ready(): boolean;
  accept(change: Change): () => void;
  acceptAll(): () => void;
  reject(change: Change): string | null;
  rejected(): readonly RejectedChange[];
  restore(id: string): boolean;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

export interface TrackerDeps {
  readonly doc: Y.Doc;
  readonly room: string;
  readonly texts: () => ReadonlyMap<string | null, Y.Text>;
}

const QUIET_MS = 3000;
const LONGEST_MS = 10_000;
const NOTIFY_MS = 150;

function hasContent(texts: ReadonlyMap<string | null, Y.Text>): boolean {
  for (const text of texts.values()) if (text.length) return true;
  return false;
}

interface RejectedShelf {
  list(): readonly RejectedChange[];
  add(record: RejectedChange): void;
  remove(id: string): void;
}

function rejectedShelf(room: string, changed: () => void): RejectedShelf {
  let rejected: RejectedChange[] = [];
  const keep = (next: RejectedChange[]): void => {
    rejected = next.slice(0, MAX_REJECTED);
    void saveDoc(docKey.rejected(room), encodeRejected(rejected));
    changed();
  };
  void loadDoc(docKey.rejected(room)).then((bytes) => {
    rejected = [...rejected, ...decodeRejected(bytes)].slice(0, MAX_REJECTED);
    changed();
  });
  return {
    list: () => rejected,
    add: (record) => keep([record, ...rejected]),
    remove: (id) => keep(rejected.filter((item) => item.id !== id)),
  };
}

type Keep = (next: Baseline) => void;

function acceptOne(
  current: () => Baseline | null,
  keep: Keep,
  change: Change,
): () => void {
  const base = current();
  if (!base) return () => {};
  const key = acceptKey(change);
  keep({ snapshot: base.snapshot, accepted: new Set([...base.accepted, key]) });
  return () => {
    const now = current();
    if (!now?.accepted.has(key)) return;
    const accepted = new Set(now.accepted);
    accepted.delete(key);
    keep({ snapshot: now.snapshot, accepted });
  };
}

function acceptEvery(
  current: () => Baseline | null,
  keep: Keep,
  doc: Y.Doc,
): () => void {
  const before = current();
  const after = freshBaseline(doc);
  keep(after);
  return () => {
    if (before && current() === after) keep(before);
  };
}

export function createChangeTracker(deps: TrackerDeps): ChangeTracker {
  const { doc, room } = deps;
  const changed = createEmitter();
  let base: Baseline | null = null;
  let cached: Change[] | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let notifyTimer: ReturnType<typeof setTimeout> | null = null;
  let firstContent = 0;
  let destroyed = false;

  const notify = (): void => {
    cached = null;
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      changed.emit();
    }, NOTIFY_MS);
  };

  const keep = (next: Baseline): void => {
    base = next;
    void saveDoc(docKey.baseline(room), encodeBaseline(next));
    notify();
  };

  const settleLater = (): void => {
    if (base || destroyed || !hasContent(deps.texts())) return;
    const now = Date.now();
    firstContent ||= now;
    if (settleTimer) clearTimeout(settleTimer);
    const wait = Math.min(QUIET_MS, firstContent + LONGEST_MS - now);
    settleTimer = setTimeout(
      () => {
        settleTimer = null;
        if (!base && !destroyed) keep(freshBaseline(doc));
      },
      Math.max(0, wait),
    );
  };

  const onUpdate = (): void => {
    if (base) notify();
    else settleLater();
  };
  doc.on("update", onUpdate);

  void loadDoc(docKey.baseline(room)).then((bytes) => {
    if (destroyed || base) return;
    const stored = bytes && decodeBaseline(bytes);
    if (stored) {
      base = stored;
      notify();
    } else if (hasContent(deps.texts())) keep(freshBaseline(doc));
    else settleLater();
  });

  const shelf = rejectedShelf(room, () => !destroyed && notify());

  const textAt = (path: string | null): Y.Text | null =>
    deps.texts().get(path) ?? null;

  return {
    list() {
      if (!base) return [];
      cached ??= changesOf(doc, deps.texts(), base);
      return cached;
    },
    ready: () => base !== null,
    accept: (change) => acceptOne(() => base, keep, change),
    acceptAll: () => acceptEvery(() => base, keep, doc),
    reject(change) {
      if (!base) return null;
      cached = null;
      const fresh = changesOf(doc, deps.texts(), base).find(
        (candidate) => candidate.key === change.key,
      );
      const text = textAt(change.path);
      if (!fresh || !text) return null;
      const record = rejectAnchored(text, fresh);
      shelf.add(record);
      return record.id;
    },
    rejected: shelf.list,
    restore(id) {
      const record = shelf.list().find((item) => item.id === id);
      const text = record && textAt(record.path);
      if (!record || !text || !restoreRejected(text, record)) return false;
      shelf.remove(id);
      return true;
    },
    onChange: changed.on,
    destroy() {
      destroyed = true;
      doc.off("update", onUpdate);
      if (settleTimer) clearTimeout(settleTimer);
      if (notifyTimer) clearTimeout(notifyTimer);
      changed.clear();
    },
  };
}
