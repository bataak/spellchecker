export const DASHES = /[-\u2013\u2014]/;

export interface Token {
  word: string;
  start: number;
  end: number;
  joined?: string;
}

export interface ErrorEntry {
  word: string;
  start: number;
  count: number;
}

export function checkable(word: string): boolean {
  const trimmedWord = word.trim();
  return (
    trimmedWord.length >= 2 &&
    /[A-Za-z\u00C0-\u024F\u0400-\u04FF]/.test(trimmedWord) &&
    !/^\p{N}[\p{N}.]*$/u.test(trimmedWord)
  );
}

export function isDashSuffix(
  text: string,
  token: Pick<Token, "word" | "start">,
): boolean {
  if (DASHES.test(token.word.slice(1))) return false;
  return (
    DASHES.test(token.word.charAt(0)) ||
    DASHES.test(text.charAt(token.start - 1))
  );
}

const NUMBER = String.raw`\p{N}+(?:[.,]\p{N}+)*`;
const LETTERS = String.raw`\p{L}[\p{L}\p{M}]*`;
const CYRILLIC = String.raw`[\u0400-\u04FF][\u0400-\u04FF\p{M}]*`;
const NUMBER_FIRST = new RegExp(`^(${NUMBER})(${LETTERS})$`, "u");
const WORD_FIRST = new RegExp(`^(${CYRILLIC})(${NUMBER})$`, "u");

export interface NumberSplit {
  word: string;
  split: string;
}

export function splitNumberBoundary(input: string): NumberSplit | null {
  const numberFirst = NUMBER_FIRST.exec(input);
  if (numberFirst) {
    return {
      word: numberFirst[2]!,
      split: numberFirst[1]! + " " + numberFirst[2]!,
    };
  }
  const wordFirst = WORD_FIRST.exec(input);
  if (wordFirst) {
    return {
      word: wordFirst[1]!,
      split: wordFirst[1]! + " " + wordFirst[2]!,
    };
  }
  return null;
}

const LONG_DASH = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/;
const LONG_DASH_ALL = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/g;
const CYRILLIC_LETTER = /[\u0400-\u04FF]/;

export function isAbbrev(word: string): boolean {
  return /^[\u0400-\u04FF]{2,}$/u.test(word) && word === word.toUpperCase();
}

function isCyrillicSuffix(word: string): boolean {
  return (
    /^[\u0400-\u04FF]+$/u.test(word) &&
    word === word.toLowerCase() &&
    word !== word.toUpperCase()
  );
}

export function dashSpan(
  text: string,
  token: Pick<Token, "word" | "start">,
): Token | null {
  if (token.start < 3) return null;
  if (!LONG_DASH.test(text.charAt(token.start - 1))) return null;
  if (!isCyrillicSuffix(token.word)) return null;
  let left = token.start - 1;
  while (left > 0 && CYRILLIC_LETTER.test(text.charAt(left - 1))) left--;
  const before = left > 0 ? text.charAt(left - 1) : "";
  if (before !== "" && /[\p{L}\p{N}]/u.test(before)) return null;
  const abbrev = text.slice(left, token.start - 1);
  if (!isAbbrev(abbrev)) return null;
  const end = token.start + token.word.length;
  return { word: text.slice(left, end), start: left, end };
}

export function dashNormalized(word: string): string | null {
  LONG_DASH_ALL.lastIndex = 0;
  if (!LONG_DASH_ALL.test(word)) return null;
  return word.replace(LONG_DASH_ALL, "-");
}

function isSpanBoundary(text: string, start: number, end: number): boolean {
  const before = start > 0 ? text.charAt(start - 1) : "";
  const after = end < text.length ? text.charAt(end) : "";
  if (before !== "" && /[\p{L}\p{N}]/u.test(before)) return false;
  if (after !== "" && /[\p{L}\p{M}\p{N}]/u.test(after)) return false;
  return true;
}

export function dashNormalizeApply(
  text: string,
  token: Pick<Token, "word" | "start">,
  replacement: string,
): { text: string; caret: number } | null {
  const normalized = dashNormalized(token.word);
  if (normalized === null || normalized !== replacement) return null;
  const end = token.start + token.word.length;
  if (text.slice(token.start, end) !== token.word) return null;
  let result = "";
  let cursor = 0;
  for (;;) {
    const at = text.indexOf(token.word, cursor);
    if (at < 0) break;
    const stop = at + token.word.length;
    if (isSpanBoundary(text, at, stop)) {
      result += text.slice(cursor, at) + normalized;
      cursor = stop;
    } else {
      result += text.slice(cursor, stop);
      cursor = stop;
    }
  }
  result += text.slice(cursor);
  return { text: result, caret: end };
}

export function isDecimalPoint(left: string, right: string): boolean {
  return /\p{N}$/u.test(left) && /^\p{N}/u.test(right);
}

export function startsLowerAfterDash(word: string): boolean {
  const ch = word.replace(/^[-\u2013\u2014]+/, "").charAt(0);
  return ch !== "" && ch === ch.toLowerCase() && ch !== ch.toUpperCase();
}

export function buildErrorList(
  tokens: Pick<Token, "word" | "start">[],
): ErrorEntry[] {
  const seen = new Map<string, ErrorEntry>();
  for (const token of tokens) {
    const key = token.word.toLowerCase();
    const existingEntry = seen.get(key);
    if (existingEntry) existingEntry.count++;
    else seen.set(key, { word: token.word, start: token.start, count: 1 });
  }
  return [...seen.values()];
}
