import type * as Y from "yjs";
import { randomId } from "./collabkey.ts";
import type { Profile } from "./cursors.ts";
import { cleanName, cleanText } from "./safetext.ts";

export interface ChatMessage {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly at: number;
  readonly text: string;
  readonly mine: boolean;
}

export interface Chat {
  list(): readonly ChatMessage[];
  send(text: string): boolean;
  unread(): number;
  seen(): void;
  onChange(listener: () => void): () => void;
  destroy(): void;
}

export interface MineStore {
  has(id: string, text: string): boolean;
  add(id: string, text: string): void;
}

interface Stored {
  readonly i: string;
  readonly n: string;
  readonly c: number;
  readonly a: number;
  readonly t: string;
}

export const MAX_MESSAGES = 300;
export const MAX_CHAT_TEXT = 2000;
export const MAX_CHAT_NAME = 40;
const MAX_ID = 24;
const MAX_COLOR = 64;
const MAX_ENTRY = 4096;
const CHAT = "chat";
const NO_NAME = "Нэргүй";

function entrySize(value: object): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Infinity;
  }
}

function valid(value: unknown): value is Stored {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Partial<Stored>;
  return (
    typeof v.i === "string" &&
    v.i.length > 0 &&
    v.i.length <= MAX_ID &&
    typeof v.n === "string" &&
    v.n.length <= MAX_CHAT_NAME &&
    Number.isInteger(v.c) &&
    v.c! >= 0 &&
    v.c! < MAX_COLOR &&
    Number.isFinite(v.a) &&
    typeof v.t === "string" &&
    v.t.length > 0 &&
    v.t.length <= MAX_CHAT_TEXT &&
    entrySize(value) <= MAX_ENTRY
  );
}

function invalidAt(array: Y.Array<unknown>): number[] {
  const out: number[] = [];
  array.forEach((value, index) => {
    if (!valid(value)) out.push(index);
  });
  return out;
}

function prune(array: Y.Array<unknown>): void {
  const doc = array.doc;
  const bad = invalidAt(array);
  if (!bad.length || !doc) return;
  doc.transact(() => {
    for (const index of bad.reverse()) array.delete(index, 1);
  });
}

export function createChat(
  doc: Y.Doc,
  mine: MineStore,
  profile: () => Profile,
): Chat {
  const array = doc.getArray<unknown>(CHAT);
  const listeners = new Set<() => void>();
  let cached: ChatMessage[] | null = null;

  const list = (): ChatMessage[] => {
    if (cached) return cached;
    const out: ChatMessage[] = [];
    for (const value of array.toArray()) {
      if (!valid(value)) continue;
      const text = cleanText(value.t).trim();
      if (!text) continue;
      out.push({
        id: value.i,
        name: cleanName(value.n, MAX_CHAT_NAME) || NO_NAME,
        color: value.c,
        at: value.a,
        text,
        mine: mine.has(value.i, value.t),
      });
    }
    cached = out.slice(-MAX_MESSAGES);
    return cached;
  };
  let seenIds = new Set(list().map((message) => message.id));
  const markSeen = (): void => {
    seenIds = new Set(list().map((message) => message.id));
  };

  const observer = (event: Y.YArrayEvent<unknown>): void => {
    cached = null;
    if (!event.transaction.local) prune(array);
    for (const listener of listeners) listener();
  };
  array.observe(observer);
  prune(array);

  return {
    list,
    send(text) {
      const body = cleanText(text).trim().slice(0, MAX_CHAT_TEXT);
      if (!body) return false;
      const { name, color } = profile();
      const stored: Stored = {
        i: randomId(9),
        n: cleanName(name, MAX_CHAT_NAME),
        c: Number.isInteger(color) ? Math.abs(color) % MAX_COLOR : 0,
        a: Date.now(),
        t: body,
      };
      mine.add(stored.i, stored.t);
      doc.transact(() => {
        array.push([stored]);
        const extra = array.length - MAX_MESSAGES;
        if (extra > 0) array.delete(0, extra);
      });
      markSeen();
      return true;
    },
    unread: () =>
      list().filter((message) => !message.mine && !seenIds.has(message.id))
        .length,
    seen: markSeen,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      array.unobserve(observer);
      listeners.clear();
    },
  };
}
