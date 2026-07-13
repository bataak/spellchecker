export const DASHES = /[-\u2013\u2014]/;

export interface Token {
  word: string;
  start: number;
  end: number;
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
    !/^\p{N}+(-|$)/u.test(trimmedWord)
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
