export const FILE_LIMIT = 10;
export const PROJECT_SLOT = "project";
const FILE_PREFIX = "file-";
const LIST_KEY = "mdFiles";

export interface FileSlot {
  readonly id: string;
  readonly name: string;
  readonly sum: string | null;
}

export function isFileSlot(id: string): boolean {
  return id.startsWith(FILE_PREFIX);
}

export function nextFileId(slots: readonly FileSlot[]): string {
  let max = 0;
  for (const slot of slots) {
    const n = Number(slot.id.slice(FILE_PREFIX.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return FILE_PREFIX + String(max + 1);
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
  try {
    return parseSlots(localStorage.getItem(LIST_KEY));
  } catch {
    return [];
  }
}

export function saveSlots(slots: readonly FileSlot[]): void {
  try {
    if (slots.length) localStorage.setItem(LIST_KEY, JSON.stringify(slots));
    else localStorage.removeItem(LIST_KEY);
  } catch {}
}
