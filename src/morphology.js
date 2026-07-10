function H(tpl) {
  const map = { A: ["а", "э", "о", "ө"], Y: ["ы", "ий"] };
  let out = [""];
  for (const ch of tpl) {
    const opts = map[ch] || [ch];
    const next = [];
    for (const p of out) for (const o of opts) next.push(p + o);
    out = next;
  }
  return out;
}

const NOUN_MS = [
  ...H("гүй"),
  ...H("Yн"),
  ...H("нY"),
  "гийн",
  ...H("Y"),
  "н",
  "йн",
  ...H("Yг"),
  "г",
  "йг",
  "д",
  "т",
  "нд",
  ...H("Aд"),
  "ид",
  "уд",
  "үд",
  "ыд",
  ...H("AAс"),
  ...H("AAр"),
  ...H("AA"),
  "тай",
  "тэй",
  "той",
  ...H("гAA"),
  ...H("хAA"),
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
  ...H("нхдAA"),
  ...H("нхтAA"),
  ...H("нхтэй"),
  "нхэд",
  "нхад",
  "нход",
];

const VERB_MS = [
  "в",
  "вч",
  ...H("Aв"),
  ...H("лAA"),
  "жээ",
  "чээ",
  "ж",
  "ч",
  ...H("сAн"),
  "сн",
  ...H("сAAр"),
  ...H("сAд"),
  "сд",
  ...H("нA"),
  "нам",
  "нэм",
  "муй",
  "мүй",
  "муу",
  "мүү",
  ...H("AAд"),
  ...H("AAч"),
  "ай",
  "эй",
  "ой",
  "өй",
  ...H("дAг"),
  "дг",
  ...H("Aг"),
  ...H("Aх"),
  ...H("Aл"),
  ...H("Aм"),
  ...H("Aн"),
  ...H("вAл"),
  ...H("вAAс"),
  ...H("бAл"),
  ...H("бAAс"),
  ...H("мAгц"),
  ...H("тAл"),
  ...H("тлAA"),
  "хул",
  "хүл",
  "ул",
  "үл",
  ...H("мAAр"),
  ...H("мAр"),
  ...H("лAAр"),
  "уй",
  "үй",
  "уйц",
  "үйц",
  "дүй",
  "дуй",
  "жухуй",
  "чухуй",
  "шгүй",
  ...H("Aшгүй"),
  ...H("Aс"),
  ...H("Aж"),
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
  ...H("члAн"),
  "чаа",
  "чаан",
  ...H("Aр"),
  ...H("Aч"),
  ...H("тгAй"),
  "тгий",
  ...H("хчAA"),
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
  ...H("нхAн"),
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
  const MS = [...new Set(morphs)].sort((a, b) => b.length - a.length);
  return function (tail, prevCh) {
    let rest = tail;
    let prev = prevCh;
    if (rest[0] === "-") {
      rest = rest.slice(1);
      prev = "-";
    }
    if (rest === "") return true;
    const memo = new Map();
    function go(i, pc, run) {
      if (i === rest.length) return true;
      const key = i * 4 + run;
      if (memo.has(key)) return memo.get(key);
      let ok = false;
      for (const m of MS) {
        if (!rest.startsWith(m, i)) continue;
        if (m === "т" && pc === "т") continue;
        const nr = m.length === 1 ? run + 1 : 0;
        if (nr > 2) continue;
        if (go(i + m.length, m[m.length - 1], nr)) {
          ok = true;
          break;
        }
      }
      memo.set(key, ok);
      return ok;
    }
    return go(0, prev, 0);
  };
}

export const nounChain = mkChain(NOUN_MS);
export const unionChain = mkChain([...NOUN_MS, ...VERB_MS]);

const VOWELS = "аэиоуөүы";

export function sameRoot(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i < 3) return false;
  const pc = a[i - 1];
  for (let da = 0; da <= 1; da++) {
    for (let db = 0; db <= 1; db++) {
      const sa = a.slice(i, i + da);
      const sb = b.slice(i, i + db);
      if (sa.split("").some((c) => c === pc)) continue;
      if (sb.split("").some((c) => c === pc)) continue;
      let ta = a.slice(i + da);
      let tb = b.slice(i + db);
      let cpc = pc;
      if (da + db === 1 && VOWELS.includes(da === 1 ? sa : sb)) {
        let j = 0;
        while (j < ta.length && j < tb.length && ta[j] === tb[j]) j++;
        if (j > 0) {
          cpc = ta[j - 1];
          ta = ta.slice(j);
          tb = tb.slice(j);
        }
      }
      if (ta === "" && tb === "") return true;
      if (nounChain(ta, cpc) && nounChain(tb, cpc)) return true;
      if (ta === "" && unionChain(tb, cpc)) return true;
      if (tb === "" && unionChain(ta, cpc)) return true;
    }
  }
  return false;
}
