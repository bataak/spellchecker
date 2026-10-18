export interface WordSpan {
  start: number;
  end: number;
  word: string;
}

const CYRILLIC = /\p{Script=Cyrillic}/u;
const CYRILLIC_OR_LATIN = /[\p{Script=Cyrillic}\p{Script=Latin}]/u;
const CONNECTOR = "-\u2010\u2011\u2019'";

export function wordAt(
  text: string,
  offset: number,
  latin = false,
): WordSpan | null {
  if (offset < 0 || offset > text.length) return null;

  const letter = latin ? CYRILLIC_OR_LATIN : CYRILLIC;
  const isLetter = (ch: string): boolean => letter.test(ch);
  const isWordChar = (ch: string): boolean =>
    isLetter(ch) || CONNECTOR.includes(ch);

  let at = offset;
  const before = at > 0 ? text[at - 1]! : "";
  const here = at < text.length ? text[at]! : "";

  if (!isWordChar(before) && !isWordChar(here)) return null;
  if (!isWordChar(before) && isWordChar(here)) at += 1;

  let s = at;
  let e = at;
  while (s > 0 && isWordChar(text[s - 1]!)) s -= 1;
  while (e < text.length && isWordChar(text[e]!)) e += 1;

  while (s < e && !isLetter(text[s]!)) s += 1;
  while (e > s && !isLetter(text[e - 1]!)) e -= 1;
  if (s >= e) return null;
  return { start: s, end: e, word: text.slice(s, e) };
}

export function englishStems(word: string): string[] {
  const lower = word.toLowerCase();
  const out: string[] = [];
  const add = (stem: string): void => {
    if (stem.length >= 2 && stem !== lower && !out.includes(stem))
      out.push(stem);
  };
  if (/['\u2019]s$/.test(lower)) add(lower.slice(0, -2));
  if (lower.endsWith("ies") || lower.endsWith("ied"))
    add(lower.slice(0, -3) + "y");
  if (/(?:s|x|z|ch|sh)es$/.test(lower)) add(lower.slice(0, -2));
  if (lower.endsWith("s") && !lower.endsWith("ss")) add(lower.slice(0, -1));
  if (lower.endsWith("ed")) {
    if (/([^aeiou])\1ed$/.test(lower)) add(lower.slice(0, -3));
    add(lower.slice(0, -2));
    add(lower.slice(0, -1));
  }
  if (lower.endsWith("ing")) {
    if (/([^aeiou])\1ing$/.test(lower)) add(lower.slice(0, -4));
    add(lower.slice(0, -3));
    add(lower.slice(0, -3) + "e");
  }
  return out;
}

export function normalizeKey(word: string): string {
  return word.replace(/[\u2010\u2011]/g, "-").replace(/'/g, "\u2019");
}

export function lookupKeys(word: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const base = normalizeKey(word);
  for (const k of [base, base.toLocaleLowerCase("mn")]) {
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function isLookupKey(e: {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  if (e.altKey) return false;
  if (e.code === "F2") return !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (e.code !== "Space") return false;
  return e.shiftKey && (e.ctrlKey || e.metaKey);
}
