import * as Y from "yjs";
import { dropDoc, loadDoc, saveDoc } from "./docstore.ts";
import { MAX_CHAT_TEXT, MAX_MESSAGES, type MineStore } from "./chat.ts";

export interface ChatDoc {
  readonly doc: Y.Doc;
  readonly mine: MineStore;
  close(forget: boolean): Promise<void>;
}

const SAVE_MS = 2000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const chatKey = (room: string): string => "chat:" + room;
export const mineKey = (room: string): string => "mine:" + room;

function readMine(bytes: Uint8Array | null): Map<string, string> {
  if (!bytes) return new Map();
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    if (!Array.isArray(value)) return new Map();
    return new Map(
      value.filter(
        (pair): pair is [string, string] =>
          Array.isArray(pair) &&
          typeof pair[0] === "string" &&
          typeof pair[1] === "string" &&
          pair[1].length <= MAX_CHAT_TEXT,
      ),
    );
  } catch {
    return new Map();
  }
}

function mineStore(room: string, sent: Map<string, string>): MineStore {
  return {
    has: (id, text) => sent.get(id) === text,
    add(id, text) {
      sent.set(id, text);
      for (const old of sent.keys()) {
        if (sent.size <= MAX_MESSAGES) break;
        sent.delete(old);
      }
      void saveDoc(mineKey(room), encoder.encode(JSON.stringify([...sent])));
    },
  };
}

export async function forgetChat(room: string): Promise<void> {
  await dropDoc(chatKey(room));
  await dropDoc(mineKey(room));
}

export async function openChatDoc(room: string): Promise<ChatDoc> {
  const doc = new Y.Doc();
  const [stored, sent] = await Promise.all([
    loadDoc(chatKey(room)),
    loadDoc(mineKey(room)),
  ]);
  if (stored) Y.applyUpdate(doc, stored);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    return saveDoc(chatKey(room), Y.encodeStateAsUpdate(doc));
  };
  const soon = (): void => {
    timer ??= setTimeout(() => void save(), SAVE_MS);
  };
  const hidden = (): void => {
    if (document.visibilityState === "hidden" && timer) void save();
  };
  doc.on("update", soon);
  document.addEventListener("visibilitychange", hidden);
  return {
    doc,
    mine: mineStore(room, readMine(sent)),
    async close(forget) {
      doc.off("update", soon);
      document.removeEventListener("visibilitychange", hidden);
      if (forget) {
        if (timer) clearTimeout(timer);
        await forgetChat(room);
      } else await save();
      doc.destroy();
    },
  };
}
