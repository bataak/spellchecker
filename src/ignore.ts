import { KEYS, readJson, writeJson } from "./store.ts";
type CasePattern = "lower" | "capital" | "upper";
const REACH: Record<CasePattern, number> = { upper: 0, capital: 1, lower: 2 };

const FOREIGN_STEM =
  /^(\P{Script=Cyrillic}*\p{L}\P{Script=Cyrillic}*?)[-\u2010\u2011](?=\p{Ll})[\u0400-\u04FF]+$/u;

export function ignoreStem(word: string): string {
  return FOREIGN_STEM.exec(word)?.[1] ?? word;
}

function isMixedScript(word: string): boolean {
  return /\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word);
}

export function ignoreParts(word: string): string[] {
  const pieces = word.trim().normalize("NFC").split(".");
  return pieces
    .map(ignoreStem)
    .filter(
      (piece, at) => [...piece].length > (at === pieces.length - 1 ? 1 : 2),
    );
}

export function canIgnore(word: string): boolean {
  const parts = ignoreParts(word);
  return parts.length > 0 && !parts.some(isMixedScript);
}

let ignored: string[] = [];
let lookup = new Map<string, CasePattern>();

function caseOf(word: string): CasePattern {
  let upper = 0,
    lower = 0,
    firstCased: string | null = null;
  for (const ch of word) {
    const upperChar = ch.toUpperCase(),
      lowerChar = ch.toLowerCase();
    if (upperChar === lowerChar) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === upperChar) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}

function rebuild() {
  lookup = new Map();
  for (const word of ignored) {
    lookup.set(word.normalize("NFC").toLowerCase(), caseOf(word));
  }
}

function load() {
  const parsed = readJson(KEYS.ignored);
  ignored = Array.isArray(parsed)
    ? [
        ...new Set(
          parsed
            .filter((w): w is string => typeof w === "string" && canIgnore(w))
            .flatMap(ignoreParts),
        ),
      ]
    : [];
  rebuild();
}

function persist() {
  writeJson(KEYS.ignored, ignored);
}

export function isIgnored(word: string): boolean {
  if (matches(word)) return true;
  if (!/[-.\u2010\u2011]/.test(word)) return false;
  const parts = ignoreParts(word);
  return parts.length > 0 && parts.every(matches);
}

function matches(word: string): boolean {
  const stored = lookup.get(word.normalize("NFC").toLowerCase());
  if (stored === undefined) return false;
  if (stored === "lower") return true;
  const wordCase = caseOf(word);
  if (stored === "capital")
    return wordCase === "capital" || wordCase === "upper";
  return wordCase === "upper";
}

export function addIgnored(word: string): boolean {
  if (!canIgnore(word)) return false;
  let added = false;
  for (const part of ignoreParts(word)) added = addPart(part) || added;
  return added;
}

function addPart(trimmedWord: string): boolean {
  load();
  const key = trimmedWord.toLowerCase();
  const existing = lookup.get(key);
  if (existing !== undefined) {
    if (REACH[existing] >= REACH[caseOf(trimmedWord)]) return false;
    ignored = ignored.filter(
      (stored) => stored.normalize("NFC").toLowerCase() !== key,
    );
  }
  ignored.push(trimmedWord);
  rebuild();
  persist();
  return true;
}

export function removeIgnored(word: string): boolean {
  load();
  const before = ignored.length;
  ignored = ignored.filter((stored) => stored !== word);
  if (ignored.length === before) return false;
  rebuild();
  persist();
  return true;
}

export function clearIgnored(): boolean {
  load();
  if (!ignored.length) return false;
  ignored = [];
  rebuild();
  persist();
  return true;
}

export function getIgnored(): string[] {
  return ignored.slice();
}

const listeners = new Set<() => void>();

export function onIgnoredChange(listener: () => void): void {
  listeners.add(listener);
}

load();
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEYS.ignored.name && event.key !== null) return;
    load();
    for (const listener of listeners) listener();
  });
}
