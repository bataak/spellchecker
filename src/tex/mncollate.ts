const MONGOLIAN = "абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя";
const RANK = new Map([...MONGOLIAN].map((letter, at) => [letter, at]));

const KIND = { symbol: 0, digit: 1, mongolian: 2, latin: 3, letter: 4 };

interface Weight {
  readonly kind: number;
  readonly rank: number;
}

function weigh(char: string): Weight {
  const lower = char.toLowerCase();
  const rank = RANK.get(lower);
  if (rank !== undefined) return { kind: KIND.mongolian, rank };
  if (/[a-z]/.test(lower))
    return { kind: KIND.latin, rank: lower.charCodeAt(0) };
  if (/\p{Nd}/u.test(char))
    return { kind: KIND.digit, rank: char.codePointAt(0)! };
  if (/\p{L}/u.test(char))
    return { kind: KIND.letter, rank: lower.codePointAt(0)! };
  return { kind: KIND.symbol, rank: char.codePointAt(0)! };
}

export function compareMongolian(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
    const x = weigh(left[at]!);
    const y = weigh(right[at]!);
    if (x.kind !== y.kind) return x.kind - y.kind;
    if (x.rank !== y.rank) return x.rank - y.rank;
  }
  if (left.length !== right.length) return left.length - right.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function letterGroup(word: string): string {
  const first = [...word][0] ?? "";
  const { kind } = weigh(first);
  if (kind === KIND.symbol || kind === KIND.digit) return "";
  return first.toUpperCase();
}
