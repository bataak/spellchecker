import { gunzipSync } from "fflate";
import { IFO_MAGIC, parseIfo, type StarDict } from "./stardict.ts";
import { buildStarDict } from "./stardictload.ts";
import {
  baseName,
  extractArchive,
  isArchiveName,
  isJunkEntry,
} from "./archive.ts";

export type DictPart = "ifo" | "idx" | "dict" | "syn";

export interface UserDict {
  name: string;
  label?: string;
  digest?: string;
  ifo: string;
  idx: ArrayBuffer;
  syn: ArrayBuffer | null;
  dict: Blob;
  saved: number;
}

export interface LoadedUserDict {
  name: string;
  digest: string;
  dict: StarDict;
}

export interface IncompleteDict {
  name: string;
  missing: DictPart[];
}

export interface ImportResult {
  added: string[];
  updated: string[];
  skipped: string[];
  incomplete: IncompleteDict[];
  failed: string[];
}

const REQUIRED_PARTS: DictPart[] = ["ifo", "idx", "dict"];

export const PART_LABELS: Record<DictPart, string> = {
  ifo: ".ifo",
  idx: ".idx.gz",
  dict: ".dict.dz",
  syn: ".syn",
};

export function missingParts(
  group: Partial<Record<DictPart, unknown>>,
): DictPart[] {
  return REQUIRED_PARTS.filter((part) => !group[part]);
}

export interface DictFingerprint {
  name: string;
  digest: string;
}

export interface KnownDict {
  name: string;
  digest: string;
  user: boolean;
}

export type ImportAction = "add" | "update" | "same" | "bundled";

export async function idxDigest(idx: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", idx.slice());
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function classifyImport(
  incoming: DictFingerprint,
  known: KnownDict[],
  stored: DictFingerprint | null,
): ImportAction {
  const match = known.find((dict) => dict.digest === incoming.digest);
  if (match) return match.user ? "same" : "bundled";
  if (stored?.digest === incoming.digest) return "same";
  return stored ? "update" : "add";
}

async function digestOf(record: UserDict): Promise<string> {
  return record.digest ?? (await idxDigest(new Uint8Array(record.idx)));
}

const PARTS: [RegExp, DictPart][] = [
  [/\.ifo$/i, "ifo"],
  [/\.idx(\.gz)?$/i, "idx"],
  [/\.dict(\.dz)?$/i, "dict"],
  [/\.syn(\.gz)?$/i, "syn"],
];

const DB_NAME = "mn-spell-user-dicts";
const DB_VERSION = 2;
const STORE = "dicts";
const SETTINGS = "settings";
const ORDER_KEY = "order";

export function dictPartOf(
  name: string,
): { base: string; part: DictPart } | null {
  for (const [pattern, part] of PARTS) {
    const match = pattern.exec(name);
    if (match) return { base: name.slice(0, match.index), part };
  }
  return null;
}

export function groupDictFiles<T extends { name: string }>(
  files: T[],
): Map<string, Partial<Record<DictPart, T>>> {
  const groups = new Map<string, Partial<Record<DictPart, T>>>();
  for (const file of files) {
    const found = dictPartOf(file.name);
    if (!found) continue;
    const group = groups.get(found.base) ?? {};
    group[found.part] = file;
    groups.set(found.base, group);
  }
  return groups;
}

function unzip(bytes: Uint8Array): Uint8Array {
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
}

async function readBytes(file: Blob): Promise<Uint8Array> {
  return unzip(new Uint8Array(await file.arrayBuffer()));
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE))
      db.createObjectStore(STORE, { keyPath: "name" });
    if (!db.objectStoreNames.contains(SETTINGS))
      db.createObjectStore(SETTINGS, { keyPath: "key" });
  };
  return settle(request);
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await settle(run(db.transaction(name, mode).objectStore(name)));
  } finally {
    db.close();
  }
}

export function saveUserDict(dict: UserDict): Promise<IDBValidKey> {
  return withStore(STORE, "readwrite", (store) => store.put(dict));
}

export function listUserDicts(): Promise<UserDict[]> {
  return withStore(
    STORE,
    "readonly",
    (store) => store.getAll() as IDBRequest<UserDict[]>,
  );
}

export function getUserDict(name: string): Promise<UserDict | undefined> {
  return withStore(
    STORE,
    "readonly",
    (store) => store.get(name) as IDBRequest<UserDict | undefined>,
  );
}

export async function renameUserDict(name: string, label: string): Promise<void> {
  const record = await getUserDict(name);
  if (!record) throw new Error("Толь олдсонгүй: " + name);
  const trimmed = label.trim();
  if (trimmed && trimmed !== name) record.label = trimmed;
  else delete record.label;
  await saveUserDict(record);
}

export const USER_PREFIX = "user:";

export function userKeyOf(id: string): string | null {
  return id.startsWith(USER_PREFIX) ? id.slice(USER_PREFIX.length) : null;
}

export async function removeUserDict(name: string): Promise<void> {
  await withStore(STORE, "readwrite", (store) => store.delete(name));
}

export async function saveDictOrder(order: string[]): Promise<void> {
  await withStore(SETTINGS, "readwrite", (store) =>
    store.put({ key: ORDER_KEY, value: order }),
  );
}

export async function loadDictOrder(): Promise<string[]> {
  if (typeof indexedDB === "undefined") return [];
  const record = (await withStore(SETTINGS, "readonly", (store) =>
    store.get(ORDER_KEY),
  )) as { value?: unknown } | undefined;
  return Array.isArray(record?.value)
    ? record.value.filter((id): id is string => typeof id === "string")
    : [];
}

export function sortByOrder<T extends { id: string }>(
  items: T[],
  order: string[],
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(item.id) }))
    .sort((left, right) => {
      if (left.rank != null && right.rank != null) return left.rank - right.rank;
      if (left.rank != null) return -1;
      if (right.rank != null) return 1;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length)
    return items.slice();
  const out = items.slice();
  const [item] = out.splice(index, 1);
  out.splice(target, 0, item!);
  return out;
}

async function openUserDict(record: UserDict): Promise<StarDict> {
  const dict = await buildStarDict(
    record.ifo,
    new Uint8Array(record.idx),
    record.syn ? new Uint8Array(record.syn) : null,
    record.dict,
  );
  if (record.label) dict.info.bookname = record.label;
  return dict;
}

export async function loadUserDicts(): Promise<LoadedUserDict[]> {
  if (typeof indexedDB === "undefined") return [];
  const out: LoadedUserDict[] = [];
  for (const record of await listUserDicts()) {
    try {
      out.push({
        name: record.name,
        digest: await digestOf(record),
        dict: await openUserDict(record),
      });
    } catch (_) {}
  }
  return out;
}

async function importGroup(
  base: string,
  group: Partial<Record<DictPart, File>>,
  known: KnownDict[],
  result: ImportResult,
): Promise<void> {
  const missing = missingParts(group);
  if (missing.length || !group.ifo || !group.idx || !group.dict) {
    result.incomplete.push({ name: base, missing });
    return;
  }
  const ifo = await group.ifo.text();
  const info = ifo.replace(/^\uFEFF/, "").startsWith(IFO_MAGIC)
    ? parseIfo(ifo)
    : null;
  if (!info) throw new Error(base + ": .ifo файл буруу");
  const idx = await readBytes(group.idx);
  const syn = group.syn ? await readBytes(group.syn) : null;
  const dict: UserDict = {
    name: info.bookname || base,
    digest: await idxDigest(idx),
    ifo,
    idx: idx.slice().buffer,
    syn: syn ? syn.slice().buffer : null,
    dict: group.dict,
    saved: Date.now(),
  };
  const existing = await getUserDict(dict.name).catch(() => undefined);
  const action = classifyImport(
    { name: dict.name, digest: dict.digest! },
    known,
    existing ? { name: existing.name, digest: await digestOf(existing) } : null,
  );
  const label = existing?.label ?? dict.name;
  if (action === "bundled" || action === "same") {
    result.skipped.push(label);
    return;
  }
  await openUserDict(dict);
  if (existing?.label) dict.label = existing.label;
  await saveUserDict(dict);
  (action === "update" ? result.updated : result.added).push(label);
}

export async function expandArchive(file: File): Promise<File[]> {
  const entries = await extractArchive(
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );
  return entries
    .filter((entry) => !isJunkEntry(entry.name))
    .filter((entry) => dictPartOf(baseName(entry.name)))
    .map((entry) => new File([entry.data.slice()], baseName(entry.name)));
}

export async function importDictFiles(
  files: File[],
  known: KnownDict[] = [],
): Promise<ImportResult> {
  const result: ImportResult = {
    added: [],
    updated: [],
    skipped: [],
    incomplete: [],
    failed: [],
  };
  const plain: File[] = [];
  for (const file of files) {
    if (!isArchiveName(file.name)) {
      plain.push(file);
      continue;
    }
    try {
      plain.push(...(await expandArchive(file)));
    } catch (_) {
      result.failed.push(file.name);
    }
  }
  for (const [base, group] of groupDictFiles(plain)) {
    try {
      await importGroup(base, group, known, result);
    } catch (_) {
      result.failed.push(base);
    }
  }
  return result;
}
