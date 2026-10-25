import type * as Y from "yjs";
import { dropDoc, loadDoc, saveDoc } from "./docstore.ts";
import {
  changesOf,
  decodeBaseline,
  encodeBaseline,
  freshBaseline,
  rejectChange,
  type Baseline,
  type Change,
} from "./changes.ts";

export interface ChangeTracker {
  list(): readonly Change[];
  ready(): boolean;
  accept(change: Change): void;
  acceptAll(): void;
  reject(change: Change): void;
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

export const baseKey = (room: string): string => "base:" + room;

export function forgetBaseline(room: string): Promise<void> {
  return dropDoc(baseKey(room));
}

function hasContent(texts: ReadonlyMap<string | null, Y.Text>): boolean {
  for (const text of texts.values()) if (text.length) return true;
  return false;
}

export function createChangeTracker(deps: TrackerDeps): ChangeTracker {
  const { doc, room } = deps;
  const listeners = new Set<() => void>();
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
      for (const listener of listeners) listener();
    }, NOTIFY_MS);
  };

  const keep = (next: Baseline): void => {
    base = next;
    void saveDoc(baseKey(room), encodeBaseline(next));
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

  void loadDoc(baseKey(room)).then((bytes) => {
    if (destroyed || base) return;
    const stored = bytes && decodeBaseline(bytes);
    if (stored) {
      base = stored;
      notify();
    } else if (hasContent(deps.texts())) keep(freshBaseline(doc));
    else settleLater();
  });

  const textAt = (path: string | null): Y.Text | null =>
    deps.texts().get(path) ?? null;

  return {
    list() {
      if (!base) return [];
      cached ??= changesOf(doc, deps.texts(), base);
      return cached;
    },
    ready: () => base !== null,
    accept(change) {
      if (!base) return;
      keep({
        snapshot: base.snapshot,
        accepted: new Set([...base.accepted, change.key]),
      });
    },
    acceptAll() {
      keep(freshBaseline(doc));
    },
    reject(change) {
      if (!base) return;
      cached = null;
      const fresh = changesOf(doc, deps.texts(), base).find(
        (candidate) => candidate.key === change.key,
      );
      const text = textAt(change.path);
      if (fresh && text) rejectChange(text, fresh);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      destroyed = true;
      doc.off("update", onUpdate);
      if (settleTimer) clearTimeout(settleTimer);
      if (notifyTimer) clearTimeout(notifyTimer);
      listeners.clear();
    },
  };
}
