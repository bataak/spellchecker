import { KEYS, read, remove, writeJson } from "./store.ts";
export const FILE_LIMIT = 10;
export const PROJECT_SLOT = "project";
const FILE_PREFIX = "file-";

export interface FileSlot {
  readonly id: string;
  readonly name: string;
  readonly sum: string | null;
  /** Нээсэн файлын байтын hash — ижил файлыг дахин нээхэд танина. */
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

function fnv(length: number, at: (index: number) => number): string {
  let hash = 2166136261;
  for (let i = 0; i < length; i += 1) {
    hash ^= at(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36) + ":" + length.toString(36);
}

export function textSum(text: string): string {
  return fnv(text.length, (i) => text.charCodeAt(i));
}

export function bytesSum(bytes: Uint8Array): string {
  return fnv(bytes.length, (i) => bytes[i]!);
}

const SAMPLE = 256 * 1024;

/** Файлын hash; том файлын эхний, сүүлийн хэсэг ба хэмжээгээр. */
export async function fileSum(file: Blob): Promise<string> {
  const part = async (blob: Blob): Promise<Uint8Array> =>
    new Uint8Array(await blob.arrayBuffer());
  if (file.size <= 2 * SAMPLE) return bytesSum(await part(file));
  const head = await part(file.slice(0, SAMPLE));
  const tail = await part(file.slice(file.size - SAMPLE));
  return bytesSum(head) + "." + bytesSum(tail) + "." + file.size.toString(36);
}

/** Нээх гэж буй файл аль хэдийн нээлттэй slot-той ижил эсэх. */
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
