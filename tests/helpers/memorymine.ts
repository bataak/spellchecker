import type { MineStore } from "../../src/collab/chat.ts";

export function memoryMine(): MineStore {
  const sent = new Map<string, string>();
  return {
    has: (id, text) => sent.get(id) === text,
    add: (id, text) => void sent.set(id, text),
  };
}
