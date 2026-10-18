import { gunzipSync, inflateSync } from "fflate";
import { encodeBase, safeBase, type DictListEntry } from "./dictindex.ts";
import { blobReader, openDictBytes, type DictBytes } from "./dictbytes.ts";
import {
  readStoredDict,
  removeStoredDict,
  requestPersistence,
  writeStoredDict,
  type StoredDict,
} from "./dictstore.ts";
import {
  entryLocation,
  IFO_MAGIC,
  openStarDict,
  parseIfo,
  type StarDict,
} from "./stardict.ts";

const inflateChunk = (chunk: Uint8Array, limit: number): Uint8Array =>
  inflateSync(chunk, { out: new Uint8Array(limit) });

export const RETRY_DELAYS = [400, 1500];

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function transient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export async function fetchWith<T>(
  url: string,
  read: (res: Response) => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS,
): Promise<T | null> {
  let failure: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await wait(delays[attempt - 1]!);
    try {
      const res = await fetch(url);
      if (res.ok) {
        const type = res.headers.get("content-type") ?? "";
        if (type.includes("text/html")) return null;
        return await read(res);
      }
      if (!transient(res.status)) return null;
      failure = new Error(String(res.status) + ": " + url);
    } catch (err) {
      failure = err;
    }
  }
  throw failure instanceof Error ? failure : new Error("татагдсангүй: " + url);
}

const unzip = (bytes: Uint8Array): Uint8Array =>
  bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;

const readBytes = async (res: Response): Promise<Uint8Array> =>
  unzip(new Uint8Array(await res.arrayBuffer()));

const readBlob = (res: Response): Promise<Blob> => res.blob();

async function fetchFirst<T>(
  urls: string[],
  read: (res: Response) => Promise<T>,
): Promise<T | null> {
  for (const url of urls) {
    const found = await fetchWith(url, read);
    if (found != null) return found;
  }
  return null;
}

function validIfo(text: string): boolean {
  return text.replace(/^﻿/, "").startsWith(IFO_MAGIC);
}

export function checkCoverage(dict: StarDict): void {
  const count = dict.index.starts.length;
  for (let entry = 0; entry < count; entry++) {
    const { offset, size } = entryLocation(dict.index, entry);
    if (offset + size > dict.dict.size)
      throw new Error(
        dict.info.bookname + ": dict файл дутуу (" + String(entry) + ")",
      );
  }
}

export class DictReadError extends Error {}

export function guardReads(bytes: DictBytes): DictBytes {
  return {
    size: bytes.size,
    async read(offset: number, size: number): Promise<Uint8Array> {
      try {
        return await bytes.read(offset, size);
      } catch (err) {
        throw new DictReadError(String(err));
      }
    },
  };
}

export async function buildStarDict(
  ifoText: string,
  idx: Uint8Array,
  syn: Uint8Array | null,
  dict: Blob,
): Promise<StarDict> {
  const bytes = await openDictBytes(blobReader(dict), dict.size, inflateChunk);
  return openStarDict(ifoText, idx, guardReads(bytes), syn);
}

async function openChecked(stored: StoredDict): Promise<StarDict> {
  const dict = await buildStarDict(
    stored.ifo,
    new Uint8Array(stored.idx),
    stored.syn ? new Uint8Array(stored.syn) : null,
    stored.dict,
  );
  checkCoverage(dict);
  return dict;
}

async function download(
  base: string,
  ifoText: string,
  version: string,
): Promise<StoredDict> {
  const info = parseIfo(ifoText);
  if (!info) throw new Error("StarDict ifo файл буруу");
  const idx = await fetchFirst([base + ".idx", base + ".idx.gz"], readBytes);
  if (!idx) throw new Error("StarDict idx файл алга");
  const dict = await fetchFirst([base + ".dict.dz", base + ".dict"], readBlob);
  if (!dict) throw new Error("StarDict dict файл алга");
  let syn: Uint8Array | null = null;
  if (info.synwordcount > 0) {
    syn = await fetchFirst([base + ".syn", base + ".syn.gz"], readBytes);
    if (!syn) throw new Error("StarDict syn файл алга");
  }
  return {
    ifo: ifoText,
    idx: idx.slice().buffer,
    syn: syn ? syn.slice().buffer : null,
    dict,
    version,
    saved: Date.now(),
  };
}

export async function loadStarDict(
  base: string,
  version = "",
): Promise<StarDict | null> {
  const stored = await readStoredDict(base);
  const fromStored = (): Promise<StarDict | null> =>
    stored ? openChecked(stored).catch(() => null) : Promise.resolve(null);

  if (stored && version && stored.version === version) {
    const dict = await fromStored();
    if (dict) return dict;
    await removeStoredDict(base);
  }

  let ifoText: string | null;
  try {
    ifoText = await fetchWith(base + ".ifo", (res) => res.text());
  } catch (err) {
    const dict = await fromStored();
    if (dict) return dict;
    throw err;
  }
  if (ifoText != null && !validIfo(ifoText)) return null;
  if (ifoText == null) return fromStored();

  if (stored && !version && stored.ifo === ifoText) {
    const dict = await fromStored();
    if (dict) return dict;
  }

  try {
    const fresh = await download(base, ifoText, version);
    const dict = await openChecked(fresh);
    void requestPersistence();
    void writeStoredDict(base, fresh);
    return dict;
  } catch (err) {
    const dict = await fromStored();
    if (dict) return dict;
    throw err;
  }
}

export interface BundledDict {
  entry: DictListEntry;
  dict: StarDict;
}

export interface BundledLoad {
  loaded: BundledDict[];
  failed: DictListEntry[];
}

export async function loadStarDicts(
  dir: string,
  list: DictListEntry[],
): Promise<BundledLoad> {
  const result: BundledLoad = { loaded: [], failed: [] };
  for (const entry of list) {
    if (!safeBase(entry.base)) continue;
    try {
      const dict = await loadStarDict(
        dir + encodeBase(entry.base),
        entry.version,
      );
      if (dict) result.loaded.push({ entry, dict });
      else result.failed.push(entry);
    } catch (err) {
      console.warn("StarDict ачаалагдсангүй:", entry.base, err);
      result.failed.push(entry);
    }
  }
  return result;
}
