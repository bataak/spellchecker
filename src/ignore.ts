const KEY = "mn-spell:ignored";

type CasePattern = "lower" | "capital" | "upper";

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
    lookup.set(word.toLowerCase(), caseOf(word));
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    ignored = Array.isArray(parsed)
      ? parsed.filter((w): w is string => typeof w === "string")
      : [];
  } catch (_) {
    ignored = [];
  }
  rebuild();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(ignored));
  } catch (_) {}
}

export function isIgnored(word: string): boolean {
  const stored = lookup.get(word.toLowerCase());
  if (stored === undefined) return false;
  if (stored === "lower") return true;
  const wordCase = caseOf(word);
  if (stored === "capital")
    return wordCase === "capital" || wordCase === "upper";
  return wordCase === "upper";
}

export function addIgnored(word: string): boolean {
  const trimmedWord = word.trim();
  if (!trimmedWord) return false;
  const key = trimmedWord.toLowerCase();
  const existing = lookup.get(key);
  if (existing !== undefined) {
    if (existing === "lower") return false;
    const wordCase = caseOf(trimmedWord);
    if (existing === wordCase) return false;
    ignored = ignored.filter((stored) => stored.toLowerCase() !== key);
  }
  ignored.push(trimmedWord);
  rebuild();
  persist();
  return true;
}

export function removeIgnored(word: string): boolean {
  const before = ignored.length;
  ignored = ignored.filter((stored) => stored !== word);
  if (ignored.length === before) return false;
  rebuild();
  persist();
  return true;
}

export function clearIgnored(): boolean {
  if (!ignored.length) return false;
  ignored = [];
  rebuild();
  persist();
  return true;
}

export function getIgnored(): string[] {
  return ignored.slice();
}

load();
