function expandHarmony(template: string): string[] {
  const map: Record<string, string[]> = {
    A: ["а", "э", "о", "ө"],
    Y: ["ы", "ий"],
  };
  let out = [""];

  for (const ch of template) {
    const opts = map[ch] || [ch];
    const next: string[] = [];
    for (const prefix of out)
      for (const option of opts) next.push(prefix + option);
    out = next;
  }
  return out;
}

const NOUN_MS = [
  ...expandHarmony("гүй"),
  ...expandHarmony("Yн"),
  ...expandHarmony("нY"),
  "гийн",
  ...expandHarmony("Y"),
  "н",
  "йн",
  ...expandHarmony("Yг"),
  "г",
  "йг",
  "д",
  "т",
  "нд",
  ...expandHarmony("Aд"),
  "ид",
  "уд",
  "үд",
  "ыд",
  ...expandHarmony("AAс"),
  ...expandHarmony("AAр"),
  ...expandHarmony("AA"),
  "тай",
  "тэй",
  "той",
  ...expandHarmony("гAA"),
  ...expandHarmony("хAA"),
  "еэ",
  "ёо",
  "яа",
  "ье",
  "х",
  "хан",
  "хэн",
  "хон",
  "хн",
  "ууд",
  "үүд",
  ...expandHarmony("нхдAA"),
  ...expandHarmony("нхтAA"),
  ...expandHarmony("нхтэй"),
  "нхэд",
  "нхад",
  "нход",
];

const VERB_MS = [
  "в",
  "вч",
  ...expandHarmony("Aв"),
  ...expandHarmony("лAA"),
  "жээ",
  "чээ",
  "ж",
  "ч",
  ...expandHarmony("сAн"),
  "сн",
  ...expandHarmony("сAAр"),
  ...expandHarmony("сAд"),
  "сд",
  ...expandHarmony("нA"),
  "нам",
  "нэм",
  "муй",
  "мүй",
  "муу",
  "мүү",
  ...expandHarmony("AAд"),
  ...expandHarmony("AAч"),
  "ай",
  "эй",
  "ой",
  "өй",
  ...expandHarmony("дAг"),
  "дг",
  ...expandHarmony("Aг"),
  ...expandHarmony("Aх"),
  ...expandHarmony("Aл"),
  ...expandHarmony("Aм"),
  ...expandHarmony("Aн"),
  ...expandHarmony("вAл"),
  ...expandHarmony("вAAс"),
  ...expandHarmony("бAл"),
  ...expandHarmony("бAAс"),
  ...expandHarmony("мAгц"),
  ...expandHarmony("тAл"),
  ...expandHarmony("тлAA"),
  "хул",
  "хүл",
  "ул",
  "үл",
  ...expandHarmony("мAAр"),
  ...expandHarmony("мAр"),
  ...expandHarmony("лAAр"),
  "уй",
  "үй",
  "уйц",
  "үйц",
  "дүй",
  "дуй",
  "жухуй",
  "чухуй",
  "шгүй",
  ...expandHarmony("Aшгүй"),
  ...expandHarmony("Aс"),
  ...expandHarmony("Aж"),
  "су",
  "сү",
  "сугай",
  "сүгэй",
  "тугай",
  "түгэй",
  "тун",
  "түн",
  "туй",
  "түй",
  "уужин",
  "үүжин",
  "уузай",
  "үүзэй",
  "жин",
  "зай",
  "сай",
  "ъя",
  "ъё",
  "ъе",
  "ъюу",
  "ъю",
  "юу",
  "юү",
  "ьюу",
  "ьюү",
  "ья",
  "ье",
  "ьё",
  "руун",
  "рүүн",
  "архуу",
  "эрхүү",
  "орхуу",
  "өрхүү",
  "рхуу",
  "рхүү",
  "гай",
  "гэй",
  "гой",
  "гөй",
  "хай",
  "хэй",
  "хой",
  "хөй",
  "гий",
  "хий",
  "гуй",
  "гуут",
  "гүүт",
  "уут",
  "үүт",
  "ууш",
  "үүш",
  "уур",
  "үүр",
  ...expandHarmony("члAн"),
  "чаа",
  "чаан",
  ...expandHarmony("Aр"),
  ...expandHarmony("Aч"),
  ...expandHarmony("тгAй"),
  "тгий",
  ...expandHarmony("хчAA"),
  "гч",
  "лт",
  "уш",
  "үш",
  "ут",
  "үт",
  "мр",
  "жүхүй",
  "чүхүй",
  "уун",
  "үүн",
  "шин",
  "жи",
  "чи",
  "ши",
  ...expandHarmony("нхAн"),
  "тий",
  "мз",
  "з",
  "р",
  "л",
  "м",
  "ш",
  "с",
  "ц",
  "а",
  "э",
  "и",
  "о",
  "у",
  "ө",
  "ү",
  "ы",
  "е",
  "ё",
  "ю",
  "я",
];

function mkChain(morphs: string[]): (tail: string, prevCh: string) => boolean {
  const sortedMorphs = [...new Set(morphs)].sort((a, b) => b.length - a.length);
  return function (tail: string, prevCh: string): boolean {
    let rest = tail;
    let prevChar = prevCh;
    if (rest[0] === "-") {
      rest = rest.slice(1);
      prevChar = "-";
    }
    if (rest === "") return true;
    const memo = new Map<number, boolean>();
    function matchFrom(
      pos: number,
      lastChar: string,
      singleRun: number,
    ): boolean {
      if (pos === rest.length) return true;
      const memoKey = pos * 4 + singleRun;
      if (memo.has(memoKey)) return memo.get(memoKey)!;
      let matched = false;
      for (const morph of sortedMorphs) {
        if (!rest.startsWith(morph, pos)) continue;
        if (morph === "т" && lastChar === "т") continue;
        const nextRun = morph.length === 1 ? singleRun + 1 : 0;
        if (nextRun > 2) continue;
        if (matchFrom(pos + morph.length, morph[morph.length - 1], nextRun)) {
          matched = true;
          break;
        }
      }
      memo.set(memoKey, matched);
      return matched;
    }
    return matchFrom(0, prevChar, 0);
  };
}

export const nounChain = mkChain(NOUN_MS);
export const unionChain = mkChain([...NOUN_MS, ...VERB_MS]);

const VOWELS = "аэиоуөүы";

function commonPrefix(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length])
    length++;
  return length;
}

function tailsMatch(tailA: string, tailB: string, prevChar: string): boolean {
  if (tailA === "" && tailB === "") return true;
  if (nounChain(tailA, prevChar) && nounChain(tailB, prevChar)) return true;
  if (tailA === "" && unionChain(tailB, prevChar)) return true;
  return tailB === "" && unionChain(tailA, prevChar);
}

function skipMatches(
  a: string,
  b: string,
  at: number,
  skipA: number,
  skipB: number,
): boolean {
  const prevChar = a[at - 1]!;
  const skippedA = a.slice(at, at + skipA);
  const skippedB = b.slice(at, at + skipB);
  if (skippedA.includes(prevChar) || skippedB.includes(prevChar)) return false;
  let tailA = a.slice(at + skipA);
  let tailB = b.slice(at + skipB);
  let anchor = prevChar;
  if (
    skipA + skipB === 1 &&
    VOWELS.includes(skipA === 1 ? skippedA : skippedB)
  ) {
    const realign = commonPrefix(tailA, tailB);
    if (realign > 0) {
      anchor = tailA[realign - 1]!;
      tailA = tailA.slice(realign);
      tailB = tailB.slice(realign);
    }
  }
  return tailsMatch(tailA, tailB, anchor);
}

export function sameRoot(a: string, b: string): boolean {
  const at = commonPrefix(a, b);
  if (at < 3) return false;
  for (let skipA = 0; skipA <= 1; skipA++)
    for (let skipB = 0; skipB <= 1; skipB++)
      if (skipMatches(a, b, at, skipA, skipB)) return true;
  return false;
}
