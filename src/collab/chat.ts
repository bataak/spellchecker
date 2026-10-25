import type * as Y from "yjs";
import { randomId } from "./collabkey.ts";
import type { Profile } from "./cursors.ts";

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

interface Stored {
  readonly i: string;
  readonly d: string;
  readonly n: string;
  readonly c: number;
  readonly a: number;
  readonly t: string;
}

export const MAX_MESSAGES = 300;
export const MAX_CHAT_TEXT = 2000;
const CHAT = "chat";

function parse(value: unknown, device: string): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<Stored>;
  if (
    typeof v.i !== "string" ||
    typeof v.d !== "string" ||
    typeof v.n !== "string" ||
    typeof v.c !== "number" ||
    typeof v.a !== "number" ||
    typeof v.t !== "string"
  )
    return null;
  return {
    id: v.i,
    name: v.n,
    color: v.c,
    at: v.a,
    text: v.t.slice(0, MAX_CHAT_TEXT),
    mine: v.d === device,
  };
}

export function createChat(
  doc: Y.Doc,
  device: string,
  profile: () => Profile,
): Chat {
  const array = doc.getArray<unknown>(CHAT);
  const listeners = new Set<() => void>();
  let cached: ChatMessage[] | null = null;

  const list = (): ChatMessage[] => {
    cached ??= array
      .toArray()
      .map((value) => parse(value, device))
      .filter((message): message is ChatMessage => message !== null);
    return cached;
  };
  let seenIds = new Set(list().map((message) => message.id));
  const markSeen = (): void => {
    seenIds = new Set(list().map((message) => message.id));
  };

  const observer = (): void => {
    cached = null;
    for (const listener of listeners) listener();
  };
  array.observe(observer);

  return {
    list,
    send(text) {
      const body = text.trim().slice(0, MAX_CHAT_TEXT);
      if (!body) return false;
      const { name, color } = profile();
      const stored: Stored = {
        i: randomId(9),
        d: device,
        n: name,
        c: color,
        a: Date.now(),
        t: body,
      };
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
