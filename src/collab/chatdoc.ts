import * as Y from "yjs";
import { docKey, loadDoc, loadLog, saveDoc } from "./docstore.ts";
import { applyLog, createSaver, whenHidden } from "./persistence.ts";
import { MAX_CHAT_TEXT, MAX_MESSAGES, type MineStore } from "./chat.ts";

export interface ChatDoc {
  readonly doc: Y.Doc;
  readonly mine: MineStore;
  close(forget: boolean): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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
      void saveDoc(
        docKey.mine(room),
        encoder.encode(JSON.stringify([...sent])),
      );
    },
  };
}

export async function openChatDoc(room: string): Promise<ChatDoc> {
  const doc = new Y.Doc();
  const [log, sent] = await Promise.all([
    loadLog(docKey.chat(room)),
    loadDoc(docKey.mine(room)),
  ]);
  applyLog(doc, log);
  const saver = createSaver(doc, docKey.chat(room), log.keys, []);
  const soon = (): void => saver.soon();
  doc.on("update", soon);
  const unwatch = whenHidden(() => void saver.now());
  return {
    doc,
    mine: mineStore(room, readMine(sent)),
    async close(forget) {
      doc.off("update", soon);
      unwatch();
      if (!forget) await saver.now();
      await saver.close();
      doc.destroy();
    },
  };
}
