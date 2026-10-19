import { KEYS, read, remove, writeJson } from "../core/store.ts";
export const FILE_LIMIT = 10;
export const PROJECT_SLOT = "project";
const FILE_PREFIX = "file-";

export interface FileSlot {
  readonly id: string;
  readonly name: string;
  readonly sum: string | null;
  readonly hash?: string;
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

const FNV_SEED = 2166136261;
const FNV_PRIME = 16777619;
const fnvOut = (hash: number, length: number): string =>
  (hash >>> 0).toString(36) + ":" + length.toString(36);

export function textSum(text: string): string {
  let hash = FNV_SEED;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return fnvOut(hash, text.length);
}

export function bytesSum(bytes: Uint8Array): string {
  let hash = FNV_SEED;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return fnvOut(hash, bytes.length);
}

export async function fileSum(file: Blob): Promise<string> {
  return bytesSum(new Uint8Array(await file.arrayBuffer()));
}

export function sameFile(
  slot: FileSlot,
  name: string,
  hash: string,
  text: string | null,
): boolean {
  if (slot.name !== name) return false;
  if (slot.hash === hash) return true;
  return (
    text !== null &&
    slot.sum !== null &&
    slot.sum === textSum(text.replace(/\r\n?/g, "\n"))
  );
}

export function parseSlots(raw: string | null): FileSlot[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const out: FileSlot[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const { id, name, sum, hash } = item as Record<string, unknown>;
      if (typeof id !== "string" || !isFileSlot(id)) continue;
      if (typeof name !== "string" || name === "") continue;
      if (out.some((slot) => slot.id === id)) continue;
      out.push({
        id,
        name,
        sum: typeof sum === "string" ? sum : null,
        ...(typeof hash === "string" ? { hash } : {}),
      });
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
