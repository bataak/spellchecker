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

export interface DefinitionPart {
  type: string;
  text: string;
}

export interface DictEntry {
  headword: string;
  text: string;
  pos: string[];
  source?: string;
}

export interface StemInfo {
  stem: string;
  verb: boolean | null;
}

import type { DictBytes } from "./dictbytes.ts";

export const IFO_MAGIC = "StarDict's dict ifo file";
export const POS_TAGGED_FIELD = "x-pos-tags";
export const VERB_POS = "үйл";

const TEXT_TYPES = "mltgxykwh";
const MARKUP_TYPES = "gxkh";
const MAX_ENTRIES = 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function parseIfo(text: string): StarDictInfo | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines[0] || !lines[0].startsWith(IFO_MAGIC)) return null;
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const eq = line.indexOf("=");
    if (eq > 0)
      fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
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

export function parseDefinition(
  data: Uint8Array,
  sametypesequence: string,
): DefinitionPart[] {
  const parts: DefinitionPart[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;

  const readField = (type: string, last: boolean): void => {
    if (type >= "a" && type <= "z") {
      let end = last ? data.length : data.indexOf(0, pos);
      if (end < 0) end = data.length;
      if (TEXT_TYPES.includes(type))
        parts.push({ type, text: decoder.decode(data.subarray(pos, end)) });
      pos = last ? data.length : end + 1;
      return;
    }
    if (last) {
      pos = data.length;
      return;
    }
    if (pos + 4 > data.length) {
      pos = data.length;
      return;
    }
    pos += 4 + view.getUint32(pos);
  };

  if (sametypesequence) {
    for (let k = 0; k < sametypesequence.length && pos < data.length; k++)
      readField(
        sametypesequence.charAt(k),
        k === sametypesequence.length - 1,
      );
    return parts;
  }
  while (pos < data.length) {
    const type = String.fromCharCode(data[pos]!);
    pos += 1;
    readField(type, false);
  }
  return parts;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
};

function decodeEntity(match: string, body: string): string {
  const lower = body.toLowerCase();
  if (lower.startsWith("#")) {
    const code = lower.startsWith("#x")
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return match;
    if (code >= 0xd800 && code <= 0xdfff) return match;
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[lower] ?? match;
}

const BLOCK_TAG_RE =
  /<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/?blockquote)\b[^>]*>/gi;

export function stripMarkup(markup: string): string {
  return markup
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(BLOCK_TAG_RE, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function definitionText(parts: DefinitionPart[]): string {
  return parts
    .map((part) =>
      MARKUP_TYPES.includes(part.type)
        ? stripMarkup(part.text)
        : part.text.trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

export type LookupMode = "any" | "proper";

export function capitalizeFirst(word: string): string {
  const chars = Array.from(word);
  if (!chars.length) return word;
  return chars[0]!.toUpperCase() + chars.slice(1).join("");
}

export function lookupKeys(word: string, mode: LookupMode = "any"): string[] {
  const normalized = word.normalize("NFC").trim();
  if (!normalized) return [];
  if (mode === "proper") return [normalized];
  const keys = [
    normalized,
    normalized.toLowerCase(),
    normalized.toUpperCase(),
  ];
  return keys.filter((key, position) => keys.indexOf(key) === position);
}

function stemKeys(stems: string[], mode: LookupMode): string[] {
  return mode === "proper" ? stems.map(capitalizeFirst) : stems;
}

function entriesFor(dict: StarDict, key: string): number[] {
  const hits = findEntries(dict.index, key);
  if (!dict.syn) return hits;
  const count = dict.index.starts.length;
  for (const synEntry of findEntries(dict.syn, key)) {
    const target = dict.syn.view.getUint32(dict.syn.ends[synEntry]! + 1);
    if (target < count && !hits.includes(target)) hits.push(target);
  }
  return hits;
}

export function hasEntry(
  dict: StarDict,
  word: string,
  mode: LookupMode = "any",
): boolean {
  return firstHeadword(dict, word, mode) != null;
}

function firstHeadword(
  dict: StarDict,
  word: string,
  mode: LookupMode,
): string | null {
  for (const key of lookupKeys(word, mode)) {
    const hits = entriesFor(dict, key);
    if (hits.length) return headwordAt(dict.index, hits[0]!);
  }
  return null;
}

export function findHeadword(
  dict: StarDict,
  word: string,
  stems: () => string[],
  mode: LookupMode = "any",
): string | null {
  const exact = firstHeadword(dict, word, mode);
  if (exact != null) return exact;
  for (const stem of stemKeys(stems(), mode)) {
    const found = firstHeadword(dict, stem, mode);
    if (found != null) return found;
  }
  return null;
}

function collect(
  target: DictEntry[],
  seen: Set<string>,
  entries: DictEntry[],
): void {
  for (const entry of entries) {
    const key = entry.headword + "\u0000" + entry.text;
    if (seen.has(key) || target.length >= MAX_ENTRIES) continue;
    seen.add(key);
    target.push(entry);
  }
}

export async function resolveDefinitions(
  dict: StarDict,
  word: string,
  stems: () => string[],
  mode: LookupMode = "any",
  alongside: () => string[] = () => [],
): Promise<DictEntry[]> {
  const entries: DictEntry[] = [];
  const seen = new Set<string>();
  const exact = await defineWord(dict, word, mode);
  if (exact.length) {
    collect(entries, seen, exact);
    for (const extra of stemKeys(alongside(), mode))
      collect(entries, seen, await defineWord(dict, extra, mode));
    return entries;
  }
  for (const stem of stemKeys(stems(), mode))
    collect(entries, seen, await defineWord(dict, stem, mode));
  return entries;
}

export function isVerbPos(pos: string): boolean {
  return pos.replace(/[.\s]+$/, "") === VERB_POS;
}

function acceptsPos(entry: DictEntry, verb: boolean | null): boolean {
  if (verb == null) return true;
  const isVerb = entry.pos.some(isVerbPos);
  return verb ? isVerb : !isVerb;
}

export async function resolveTagged(
  dict: StarDict,
  word: string,
  analyses: () => StemInfo[],
  mode: LookupMode = "any",
): Promise<DictEntry[]> {
  const exact = await defineWord(dict, word, mode);
  if (exact.length) return exact;
  const entries: DictEntry[] = [];
  const seen = new Set<string>();
  for (const { stem, verb } of analyses()) {
    const key = mode === "proper" ? capitalizeFirst(stem) : stem;
    const found = await defineWord(dict, key, mode);
    collect(
      entries,
      seen,
      found.filter((entry) => acceptsPos(entry, verb)),
    );
  }
  return entries;
}

export async function findTaggedHeadword(
  dict: StarDict,
  word: string,
  analyses: () => StemInfo[],
  mode: LookupMode = "any",
): Promise<string | null> {
  const exact = firstHeadword(dict, word, mode);
  if (exact != null) return exact;
  const tagged = await resolveTagged(dict, word, analyses, mode);
  return tagged[0]?.headword ?? null;
}

const GR_RE = /<gr>([\s\S]*?)<\/gr>/gi;

export function extractPos(parts: DefinitionPart[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (part.type !== "x" && part.type !== "h") continue;
    for (const match of part.text.matchAll(GR_RE)) {
      for (const piece of stripMarkup(match[1]!).split(/[,;]/)) {
        const value = piece.trim().toLowerCase();
        if (value && !out.includes(value)) out.push(value);
      }
    }
  }
  return out;
}

export async function defineWord(
  dict: StarDict,
  word: string,
  mode: LookupMode = "any",
): Promise<DictEntry[]> {
  const seen = new Set<number>();
  const entries: DictEntry[] = [];
  for (const key of lookupKeys(word, mode)) {
    for (const entry of entriesFor(dict, key)) {
      if (seen.has(entry) || entries.length >= MAX_ENTRIES) continue;
      seen.add(entry);
      const { offset, size } = entryLocation(dict.index, entry);
      if (offset + size > dict.dict.size) continue;
      const parts = parseDefinition(
        await dict.dict.read(offset, size),
        dict.info.sametypesequence,
      );
      const text = definitionText(parts);
      if (text)
        entries.push({
          headword: headwordAt(dict.index, entry),
          text,
          pos: extractPos(parts),
        });
    }
  }
  return entries;
}
