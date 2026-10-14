import { KEYS, read, remove, writeJson } from "./store.ts";
export const FILE_LIMIT = 10;
export const PROJECT_SLOT = "project";
const FILE_PREFIX = "file-";

export interface FileSlot {
  readonly id: string;
  readonly name: string;
  readonly sum: string | null;
}

export function isFileSlot(id: string): boolean {
  return id.startsWith(FILE_PREFIX);
}

export function nextFileId(slots: readonly FileSlot[]): string {
  for (;;) {
    const id =
      FILE_PREFIX +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8);
    if (!slots.some((slot) => slot.id === id)) return id;
  }
}

export function textSum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + ":" + text.length.toString(36);
}

export function parseSlots(raw: string | null): FileSlot[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const out: FileSlot[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const { id, name, sum } = item as Record<string, unknown>;
      if (typeof id !== "string" || !isFileSlot(id)) continue;
      if (typeof name !== "string" || name === "") continue;
      if (out.some((slot) => slot.id === id)) continue;
      out.push({ id, name, sum: typeof sum === "string" ? sum : null });
    }
    return out.slice(0, FILE_LIMIT);
  } catch {
    return [];
  }
}

export function loadSlots(): FileSlot[] {
  return parseSlots(read(KEYS.slots));
}

export function saveSlots(slots: readonly FileSlot[]): void {
  if (slots.length) writeJson(KEYS.slots, slots);
  else remove(KEYS.slots);
}
