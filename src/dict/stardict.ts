import {
  type StarDict,
  findEntries,
  headwordAt,
  entryLocation,
} from "./stardictformat.ts";
import {
  type DefinitionPart,
  stripMarkup,
  parseDefinition,
  definitionText,
} from "./stardictmarkup.ts";
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

import { sPluralSingulars } from "../lang/verbform.ts";

export const VERB_POS = "үйл";

const MAX_ENTRIES = 8;

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
  const keys = [normalized, normalized.toLowerCase(), normalized.toUpperCase()];
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
  collect(entries, seen, exact);
  if (exact.length)
    for (const extra of stemKeys(alongside(), mode))
      collect(entries, seen, await defineWord(dict, extra, mode));
  const plurals: string[] = [];
  for (const stem of stemKeys(stems(), mode)) {
    const lower = stem.toLowerCase();
    if (plurals.some((plural) => sPluralSingulars(plural).includes(lower)))
      continue;
    const found = await defineWord(dict, stem, mode);
    if (found.length) plurals.push(lower);
    collect(entries, seen, found);
  }
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
  const entries: DictEntry[] = [];
  const seen = new Set<string>();
  collect(entries, seen, await defineWord(dict, word, mode));
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
