import { type DictBytes } from "./dictbytes.ts";

export interface StarDictInfo {
  bookname: string;
  wordcount: number;
  idxoffsetbits: 32 | 64;
  sametypesequence: string;
  synwordcount: number;
  posTagged: boolean;
}

export interface StarDictIndex {
  bytes: Uint8Array;
  view: DataView;
  starts: Uint32Array;
  ends: Uint32Array;
  offsetBits: 32 | 64;
}

export interface StarDict {
  info: StarDictInfo;
  index: StarDictIndex;
  syn: StarDictIndex | null;
  dict: DictBytes;
}

export const IFO_MAGIC = "StarDict's dict ifo file";

export const POS_TAGGED_FIELD = "x-pos-tags";

const encoder = new TextEncoder();

export const decoder = new TextDecoder();

export function parseIfo(text: string): StarDictInfo | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines[0] || !lines[0].startsWith(IFO_MAGIC)) return null;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const eq = line.indexOf("=");
    if (eq > 0) fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const wordcount = Number(fields.get("wordcount"));
  if (!Number.isInteger(wordcount) || wordcount < 0) return null;
  const synwordcount = Number(fields.get("synwordcount") ?? "0");
  return {
    bookname: fields.get("bookname") ?? "",
    wordcount,
    idxoffsetbits: fields.get("idxoffsetbits") === "64" ? 64 : 32,
    sametypesequence: fields.get("sametypesequence") ?? "",
    synwordcount:
      Number.isInteger(synwordcount) && synwordcount > 0 ? synwordcount : 0,
    posTagged: fields.get(POS_TAGGED_FIELD) === "1",
  };
}

export function parseIdx(
  bytes: Uint8Array,
  offsetBits: 32 | 64,
  expectedCount?: number,
): StarDictIndex {
  const tail = offsetBits / 8 + 4;
  return parseWordList(bytes, tail, offsetBits, "idx", expectedCount);
}

export function parseSyn(
  bytes: Uint8Array,
  expectedCount?: number,
): StarDictIndex {
  return parseWordList(bytes, 4, 32, "syn", expectedCount);
}

function parseWordList(
  bytes: Uint8Array,
  tail: number,
  offsetBits: 32 | 64,
  label: string,
  expectedCount?: number,
): StarDictIndex {
  const starts: number[] = [];
  const ends: number[] = [];
  let pos = 0;
  while (pos < bytes.length) {
    const end = bytes.indexOf(0, pos);
    if (end < 0 || end + 1 + tail > bytes.length)
      throw new Error(label + " эвдэрсэн: " + String(pos) + " байтад");
    starts.push(pos);
    ends.push(end);
    pos = end + 1 + tail;
  }
  if (expectedCount != null && starts.length !== expectedCount)
    throw new Error(
      label +
        " үгийн тоо " +
        String(starts.length) +
        ", ifo дээр " +
        String(expectedCount),
    );
  return {
    bytes,
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    starts: Uint32Array.from(starts),
    ends: Uint32Array.from(ends),
    offsetBits,
  };
}

export function openStarDict(
  ifoText: string,
  idxBytes: Uint8Array,
  dictBytes: DictBytes,
  synBytes: Uint8Array | null = null,
): StarDict {
  const info = parseIfo(ifoText);
  if (!info) throw new Error("ifo файл буруу");
  const index = parseIdx(idxBytes, info.idxoffsetbits, info.wordcount);
  const syn = synBytes
    ? parseSyn(synBytes, info.synwordcount || undefined)
    : null;
  return { info, index, syn, dict: dictBytes };
}

function asciiLower(byte: number): number {
  return byte >= 0x41 && byte <= 0x5a ? byte + 32 : byte;
}

function compareBytes(
  left: Uint8Array,
  leftStart: number,
  leftEnd: number,
  right: Uint8Array,
): number {
  const leftLength = leftEnd - leftStart;
  const shared = Math.min(leftLength, right.length);
  let exact = 0;
  for (let k = 0; k < shared; k++) {
    const leftByte = left[leftStart + k]!;
    const rightByte = right[k]!;
    const folded = asciiLower(leftByte) - asciiLower(rightByte);
    if (folded !== 0) return folded;
    if (exact === 0) exact = leftByte - rightByte;
  }
  if (leftLength !== right.length) return leftLength - right.length;
  return exact;
}

export function stardictCompare(left: string, right: string): number {
  const leftBytes = encoder.encode(left);
  return compareBytes(leftBytes, 0, leftBytes.length, encoder.encode(right));
}

function compareAt(
  index: StarDictIndex,
  entry: number,
  key: Uint8Array,
): number {
  return compareBytes(
    index.bytes,
    index.starts[entry]!,
    index.ends[entry]!,
    key,
  );
}

export function findEntries(index: StarDictIndex, word: string): number[] {
  const key = encoder.encode(word);
  let low = 0;
  let high = index.starts.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (compareAt(index, mid, key) < 0) low = mid + 1;
    else high = mid;
  }
  const hits: number[] = [];
  for (let entry = low; entry < index.starts.length; entry++) {
    if (compareAt(index, entry, key) !== 0) break;
    hits.push(entry);
  }
  return hits;
}

const LATIN_START = /^[^\p{L}]*\p{Script=Latin}/u;

const LATIN_SAMPLES = 200;

const LATIN_SHARE = 0.05;

export function hasLatinHeadwords(index: StarDictIndex): boolean {
  const count = index.starts.length;
  if (!count) return false;
  const samples = Math.min(count, LATIN_SAMPLES);
  let latin = 0;
  for (let i = 0; i < samples; i++) {
    const entry = Math.floor(((i + 0.5) * count) / samples);
    if (LATIN_START.test(headwordAt(index, entry))) latin++;
  }
  return latin / samples >= LATIN_SHARE;
}

export function headwordAt(index: StarDictIndex, entry: number): string {
  return decoder.decode(
    index.bytes.subarray(index.starts[entry]!, index.ends[entry]!),
  );
}

export function entryLocation(
  index: StarDictIndex,
  entry: number,
): { offset: number; size: number } {
  const at = index.ends[entry]! + 1;
  if (index.offsetBits === 64) {
    return {
      offset: Number(index.view.getBigUint64(at)),
      size: index.view.getUint32(at + 8),
    };
  }
  return {
    offset: index.view.getUint32(at),
    size: index.view.getUint32(at + 4),
  };
}
