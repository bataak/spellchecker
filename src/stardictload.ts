import { gunzipSync } from "fflate";
import {
  IFO_MAGIC,
  openStarDict,
  parseIfo,
  type StarDict,
} from "./stardict.ts";

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

export async function loadStarDict(base: string): Promise<StarDict | null> {
  const ifoRes = await fetchOk(base + ".ifo");
  if (!ifoRes) return null;
  const ifoText = await ifoRes.text();
  if (!ifoText.replace(/^\uFEFF/, "").startsWith(IFO_MAGIC)) return null;
  const info = parseIfo(ifoText);
  if (!info) throw new Error("StarDict ifo файл буруу");
  const idx = await fetchFirst([base + ".idx", base + ".idx.gz"]);
  if (!idx) throw new Error("StarDict idx файл алга");
  const dict = await fetchFirst([base + ".dict.dz", base + ".dict"]);
  if (!dict) throw new Error("StarDict dict файл алга");
  let syn: Uint8Array | null = null;
  if (info.synwordcount > 0) {
    syn = await fetchFirst([base + ".syn", base + ".syn.gz"]);
    if (!syn) throw new Error("StarDict syn файл алга");
  }
  return openStarDict(ifoText, idx, dict, syn);
}
