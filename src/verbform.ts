const BACK_VOWEL = /[аоуяёы]/;
const FIRST_VOWEL = /[аэиоуөүяеёюы]/;
const ENDS_WITH_VOWEL = /[аэиоуөүяеёюый]$/;
const ENDS_WITH_PALATAL = /[жчш]$/;
const CONSONANT = "бвгджзклмнпрстфхцчшщ";
const FLEETING_VOWEL = new RegExp(
  "^(.*[" + CONSONANT + "])[аэоө]([" + CONSONANT + "])$",
);
const FLEETING_I = new RegExp("^(.*[жчш])и([" + CONSONANT + "])$");
const HAS_VOWEL = /[аэиоуөүяеёюы]/;

function dropFleetingVowel(stem: string): string | null {
  const match = stem.match(FLEETING_VOWEL) ?? stem.match(FLEETING_I);
  if (!match || !HAS_VOWEL.test(match[1]!)) return null;
  return match[1]! + match[2]!;
}

export function connectingVowel(stem: string): string {
  const lower = stem.toLowerCase();
  if (ENDS_WITH_PALATAL.test(lower)) return "и";
  const back = BACK_VOWEL.test(lower);
  const first = lower.match(FIRST_VOWEL)?.[0];
  if ((first === "о" || first === "ё") && !lower.includes("у")) return "о";
  if (first === "ө" && !lower.includes("ү")) return "ө";
  return back ? "а" : "э";
}

export function infinitiveCandidates(stem: string): string[] {
  const lower = stem.toLowerCase();
  if (!lower) return [];
  const out: string[] = [];
  if (lower.endsWith("ь")) {
    out.push(lower.slice(0, -1) + "их");
  } else if (ENDS_WITH_VOWEL.test(lower)) {
    out.push(lower + "х");
  } else {
    const vowel = connectingVowel(lower);
    out.push(lower + vowel + "х");
    const dropped = dropFleetingVowel(lower);
    if (dropped) out.push(dropped + connectingVowel(dropped) + "х");
    for (const other of ["а", "э", "о", "ө", "и"])
      out.push(lower + other + "х");
  }
  return out.filter((item, position) => out.indexOf(item) === position);
}

export interface Analysis {
  stem: string;
  verb: boolean | null;
}

const VERB_FLAG = /^[F-I]/;

export function parseAnalysis(line: string): Analysis | null {
  const stem = line.match(/(?:^|\s)st:(\S+)/)?.[1];
  if (!stem) return null;
  const flags = [...line.matchAll(/(?:^|\s)fl:(\S+)/g)].map(
    (match) => match[1]!,
  );
  return { stem, verb: flags.some((flag) => VERB_FLAG.test(flag)) };
}

export function parseAnalyses(lines: string[]): Analysis[] {
  const out: Analysis[] = [];
  for (const line of lines) {
    const analysis = parseAnalysis(line);
    if (!analysis) continue;
    const same = out.find((item) => item.stem === analysis.stem);
    if (!same) out.push(analysis);
    else if (analysis.verb) same.verb = true;
  }
  return out;
}

export function lookupCandidates(
  word: string,
  analyses: Analysis[],
  isWord: (candidate: string) => boolean,
): string[] {
  const lower = word.toLowerCase();
  const leading: string[] = [];
  const ordered: string[] = [];
  const trailing: string[] = [];
  for (const { stem, verb } of analyses) {
    const infinitives =
      verb === false
        ? []
        : infinitiveCandidates(stem).filter((candidate) => isWord(candidate));
    const early = infinitives.filter((item) => lower.startsWith(item));
    leading.push(...early);
    if (verb === true) {
      ordered.push(...infinitives.filter((item) => !early.includes(item)));
      continue;
    }
    if (stem !== word) ordered.push(stem);
    trailing.push(...infinitives.filter((item) => !early.includes(item)));
  }
  const all = [...leading, ...ordered, ...trailing];
  return all.filter((item, position) => all.indexOf(item) === position);
}
