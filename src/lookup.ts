export interface WordSpan {
  start: number;
  end: number;
  word: string;
}

const LETTER = /\p{Script=Cyrillic}/u;
const CONNECTOR = "-\u2010\u2011\u2019'";

function isLetter(ch: string): boolean {
  return LETTER.test(ch);
}

function isConnector(ch: string): boolean {
  return CONNECTOR.includes(ch);
}

function isWordChar(ch: string): boolean {
  return isLetter(ch) || isConnector(ch);
}

function trim(text: string, start: number, end: number): WordSpan | null {
  let s = start;
  let e = end;
  while (s < e && !isLetter(text[s]!)) s += 1;
  while (e > s && !isLetter(text[e - 1]!)) e -= 1;
  if (s >= e) return null;
  return { start: s, end: e, word: text.slice(s, e) };
}

export function wordAt(text: string, offset: number): WordSpan | null {
  if (offset < 0 || offset > text.length) return null;

  let at = offset;
  const before = at > 0 ? text[at - 1]! : "";
  const here = at < text.length ? text[at]! : "";

  if (!isWordChar(before) && !isWordChar(here)) return null;
  if (!isWordChar(before) && isWordChar(here)) at += 1;

  let s = at;
  let e = at;
  while (s > 0 && isWordChar(text[s - 1]!)) s -= 1;
  while (e < text.length && isWordChar(text[e]!)) e += 1;

  return trim(text, s, e);
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
