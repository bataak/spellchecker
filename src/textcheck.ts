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

// 10мг, 7.7мг, 25,5кг — тоо ба нэгж зайгүй наалдсан тохиолдол.
// Тоог задлахгүй, тоо ба үсгийн заагаар л салгана.
const NUMBER_UNIT = /^(\p{N}+(?:[.,]\p{N}+)*)(\p{L}[\p{L}\p{M}]*)$/u;

export interface NumberUnit {
  number: string;
  unit: string;
}

export function splitNumberUnit(word: string): NumberUnit | null {
  const match = NUMBER_UNIT.exec(word);
  if (!match) return null;
  return { number: match[1]!, unit: match[2]! };
}

// Хоёр талдаа цифртэй цэг нь аравтын таслал тул хуваалтын цэг биш.
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
