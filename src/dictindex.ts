export interface DictListEntry {
  base: string;
  label: string;
  version: string;
}

const IDX_NAMES = [".idx", ".idx.gz"];
const DICT_NAMES = [".dict.dz", ".dict"];

function hasAny(files: Set<string>, base: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => files.has(base + suffix));
}

export function booknameOf(ifoText: string): string | null {
  for (const line of ifoText.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.startsWith("bookname=")) continue;
    const value = line.slice("bookname=".length).trim();
    if (value) return value;
  }
  return null;
}

export function collectDicts(
  names: string[],
  readIfo: (base: string) => string | null,
  fingerprint: (base: string) => string = () => "",
): DictListEntry[] {
  const files = new Set(names);
  const bases: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".ifo")) continue;
    const base = name.slice(0, -4);
    if (!hasAny(files, base, IDX_NAMES)) continue;
    if (!hasAny(files, base, DICT_NAMES)) continue;
    bases.push(base);
  }
  bases.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return bases.map((base) => {
    const ifoText = readIfo(base);
    const label = ifoText ? booknameOf(ifoText) : null;
    return { base, label: label ?? base, version: fingerprint(base) };
  });
}

export function safeBase(base: string): boolean {
  if (base.startsWith("/") || base.includes("\\")) return false;
  return !base.split("/").some((part) => part === "" || part === "..");
}

export function encodeBase(base: string): string {
  return base.split("/").map(encodeURIComponent).join("/");
}

export function parseOrder(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line) out.push(line);
  }
  return out;
}

function rankOf(base: string, order: string[]): number {
  for (let index = 0; index < order.length; index++) {
    const entry = order[index]!;
    if (entry === base) return index;
    if (entry.endsWith("/") && base.startsWith(entry)) return index;
  }
  return order.length;
}

export function applyOrder(
  dicts: DictListEntry[],
  order: string[],
): DictListEntry[] {
  return dicts
    .map((dict, position) => ({
      dict,
      position,
      rank: rankOf(dict.base, order),
    }))
    .sort((left, right) =>
      left.rank !== right.rank
        ? left.rank - right.rank
        : left.position - right.position,
    )
    .map((item) => item.dict);
}

export function parseDictList(value: unknown): DictListEntry[] {
  if (typeof value !== "object" || value === null) return [];
  const dicts = (value as { dicts?: unknown }).dicts;
  if (!Array.isArray(dicts)) return [];
  const out: DictListEntry[] = [];
  for (const item of dicts) {
    if (typeof item !== "object" || item === null) continue;
    const base = (item as { base?: unknown }).base;
    if (typeof base !== "string" || !base) continue;
    if (!safeBase(base)) continue;
    const label = (item as { label?: unknown }).label;
    const version = (item as { version?: unknown }).version;
    out.push({
      base,
      label: typeof label === "string" && label ? label : base,
      version: typeof version === "string" ? version : "",
    });
  }
  return out;
}
