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

// 10мг, 7.7мг, 25,5кг, оруулалтаар19 — тоо ба үг зайгүй наалдсан тохиолдол.
// Тоог задлахгүй, тоо ба үсгийн заагаар л салгана.
// Тоо түрүүлсэн бол аль ч бичгийн үсэг; үг түрүүлсэн бол зөвхөн кирилл, учир нь
// латинаар MP3, COVID19 гэх мэт тоогоор төгссөн нэр хэвийн байдаг.
const NUMBER = String.raw`\p{N}+(?:[.,]\p{N}+)*`;
const LETTERS = String.raw`\p{L}[\p{L}\p{M}]*`;
const CYRILLIC = String.raw`[\u0400-\u04FF][\u0400-\u04FF\p{M}]*`;
const NUMBER_FIRST = new RegExp(`^(${NUMBER})(${LETTERS})$`, "u");
const WORD_FIRST = new RegExp(`^(${CYRILLIC})(${NUMBER})$`, "u");

export interface NumberSplit {
  // Толиос шалгах үсгэн хэсэг.
  word: string;
  // Зайгаар салгаж санал болгох хэлбэр.
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
