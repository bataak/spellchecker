import { gunzipSync, inflateSync } from "fflate";
import { encodeBase, safeBase, type DictListEntry } from "./dictindex.ts";
import { blobReader, openDictBytes } from "./dictbytes.ts";
import {
  readStoredDict,
  requestPersistence,
  writeStoredDict,
  type StoredDict,
} from "./dictstore.ts";
import {
  IFO_MAGIC,
  openStarDict,
  parseIfo,
  type StarDict,
} from "./stardict.ts";

const inflateChunk = (chunk: Uint8Array, limit: number): Uint8Array =>
  inflateSync(chunk, { out: new Uint8Array(limit) });

async function fetchOk(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null;
    return res;
  } catch (_) {
    return null;
  }
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetchOk(url);
  if (!res) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
}

async function fetchFirst(urls: string[]): Promise<Uint8Array | null> {
  for (const url of urls) {
    const bytes = await fetchBytes(url);
    if (bytes) return bytes;
  }
  return null;
}

async function fetchBlob(urls: string[]): Promise<Blob | null> {
  for (const url of urls) {
    const res = await fetchOk(url);
    if (res) return await res.blob();
  }
  return null;
}

function validIfo(text: string): boolean {
  return text.replace(/^\uFEFF/, "").startsWith(IFO_MAGIC);
}

export async function buildStarDict(
  ifoText: string,
  idx: Uint8Array,
  syn: Uint8Array | null,
  dict: Blob,
): Promise<StarDict> {
  const bytes = await openDictBytes(blobReader(dict), dict.size, inflateChunk);
  return openStarDict(ifoText, idx, bytes, syn);
}

function fromStored(stored: StoredDict): Promise<StarDict> {
  return buildStarDict(
    stored.ifo,
    new Uint8Array(stored.idx),
    stored.syn ? new Uint8Array(stored.syn) : null,
    stored.dict,
  );
}

async function download(
  base: string,
  ifoText: string,
  version: string,
): Promise<StoredDict> {
  const info = parseIfo(ifoText);
  if (!info) throw new Error("StarDict ifo файл буруу");
  const idx = await fetchFirst([base + ".idx", base + ".idx.gz"]);
  if (!idx) throw new Error("StarDict idx файл алга");
  const dict = await fetchBlob([base + ".dict.dz", base + ".dict"]);
  if (!dict) throw new Error("StarDict dict файл алга");
  let syn: Uint8Array | null = null;
  if (info.synwordcount > 0) {
    syn = await fetchFirst([base + ".syn", base + ".syn.gz"]);
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
  if (stored && version && stored.version === version)
    return fromStored(stored);

  const ifoRes = await fetchOk(base + ".ifo");
  const ifoText = ifoRes ? await ifoRes.text() : null;
  if (ifoText != null && !validIfo(ifoText)) return null;

  if (stored && (ifoText == null || stored.ifo === ifoText))
    return fromStored(stored);

  if (ifoText == null) return null;

  const fresh = await download(base, ifoText, version);
  void requestPersistence();
  void writeStoredDict(base, fresh);
  return fromStored(fresh);
}

export async function loadStarDicts(
  dir: string,
  list: DictListEntry[],
): Promise<StarDict[]> {
  const out: StarDict[] = [];
  for (const entry of list) {
    if (!safeBase(entry.base)) continue;
    try {
      const dict = await loadStarDict(
        dir + encodeBase(entry.base),
        entry.version,
      );
      if (dict) out.push(dict);
    } catch (_) {}
  }
  return out;
}
