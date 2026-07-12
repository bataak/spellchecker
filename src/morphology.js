function expandHarmony(template) {
  const map = { A: ["а", "э", "о", "ө"], Y: ["ы", "ий"] };
  let out = [""];
  for (const ch of template) {
    const opts = map[ch] || [ch];
    const next = [];
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

function mkChain(morphs) {
  const sortedMorphs = [...new Set(morphs)].sort((a, b) => b.length - a.length);
  return function (tail, prevCh) {
    let rest = tail;
    let prevChar = prevCh;
    if (rest[0] === "-") {
      rest = rest.slice(1);
      prevChar = "-";
    }
    if (rest === "") return true;
    const memo = new Map();
    function matchFrom(pos, lastChar, singleRun) {
      if (pos === rest.length) return true;
      const memoKey = pos * 4 + singleRun;
      if (memo.has(memoKey)) return memo.get(memoKey);
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

export function sameRoot(a, b) {
  let commonPrefixLen = 0;
  while (
    commonPrefixLen < a.length &&
    commonPrefixLen < b.length &&
    a[commonPrefixLen] === b[commonPrefixLen]
  )
    commonPrefixLen++;
  if (commonPrefixLen < 3) return false;
  const prevChar = a[commonPrefixLen - 1];
  for (let skipCountA = 0; skipCountA <= 1; skipCountA++) {
    for (let skipCountB = 0; skipCountB <= 1; skipCountB++) {
      const skippedCharsA = a.slice(
        commonPrefixLen,
        commonPrefixLen + skipCountA,
      );
      const skippedCharsB = b.slice(
        commonPrefixLen,
        commonPrefixLen + skipCountB,
      );
      if (skippedCharsA.split("").some((char) => char === prevChar)) continue;
      if (skippedCharsB.split("").some((char) => char === prevChar)) continue;
      let tailA = a.slice(commonPrefixLen + skipCountA);
      let tailB = b.slice(commonPrefixLen + skipCountB);
      let reanchoredPrevChar = prevChar;
      if (
        skipCountA + skipCountB === 1 &&
        VOWELS.includes(skipCountA === 1 ? skippedCharsA : skippedCharsB)
      ) {
        let realignLen = 0;
        while (
          realignLen < tailA.length &&
          realignLen < tailB.length &&
          tailA[realignLen] === tailB[realignLen]
        )
          realignLen++;
        if (realignLen > 0) {
          reanchoredPrevChar = tailA[realignLen - 1];
          tailA = tailA.slice(realignLen);
          tailB = tailB.slice(realignLen);
        }
      }
      if (tailA === "" && tailB === "") return true;
      if (
        nounChain(tailA, reanchoredPrevChar) &&
        nounChain(tailB, reanchoredPrevChar)
      )
        return true;
      if (tailA === "" && unionChain(tailB, reanchoredPrevChar)) return true;
      if (tailB === "" && unionChain(tailA, reanchoredPrevChar)) return true;
    }
  }
  return false;
}
