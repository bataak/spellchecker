import { sameRoot } from "../spell/morphology.ts";
import type { ErrorEntry } from "../spell/textcheck.ts";

export const WORD_RE = /^[Ѐ-ӿ][Ѐ-ӿ-]{1,49}$/u;

const SEPARATORS = /[\s,、，]+/;

export interface WordNote {
  readonly word: string | null;
  readonly text: string;
}

export interface Merged {
  readonly words: string[];
  readonly added: boolean;
  readonly notes: WordNote[];
}

export function hasWord(list: readonly string[], word: string): boolean {
  const key = word.toLowerCase();
  return list.some((item) => item.toLowerCase() === key);
}

export function splitParts(value: string): string[] {
  return value.split(SEPARATORS);
}

export function prefillWords(
  errors: readonly ErrorEntry[],
  submitted: ReadonlySet<string>,
): string[] {
  const list = errors
    .filter((token) => WORD_RE.test(token.word))
    .sort((a, b) => a.word.length - b.word.length);
  const kept: { key: string; word: string }[] = [];
  for (const token of list) {
    const key = token.word.toLowerCase();
    if (submitted.has(key)) continue;
    if (kept.some((entry) => sameRoot(entry.key, key))) continue;
    kept.push({ key, word: token.word });
  }
  kept.sort((a, b) => a.word.localeCompare(b.word, "mn"));
  return kept.map((entry) => entry.word);
}

export function screenWords(
  candidates: readonly string[],
  submitted: ReadonlySet<string>,
): { valid: string[]; notes: WordNote[] } {
  const valid: string[] = [];
  const notes: WordNote[] = [];
  for (const word of candidates) {
    if (!WORD_RE.test(word))
      notes.push({ word, text: "кирилл үсгээр, 2–50 тэмдэгт байх ёстой" });
    else if (submitted.has(word.toLowerCase()))
      notes.push({ word, text: "энэ үгийг аль хэдийн мэдэгдсэн байна" });
    else if (!hasWord(valid, word)) valid.push(word);
  }
  return { valid, notes };
}

export function mergeWords(
  words: readonly string[],
  valid: readonly string[],
  known: Readonly<Record<string, boolean>> | null,
  max: number,
): Merged {
  const out = [...words];
  const notes: WordNote[] = [];
  let added = false;
  for (const word of valid) {
    if (known && known[word]) {
      notes.push({ word, text: "энэ үг толь бичигт байна" });
      continue;
    }
    if (out.length >= max) {
      notes.push({ word: null, text: "Хамгийн ихдээ " + max + " үг" });
      break;
    }
    if (!hasWord(out, word)) {
      out.push(word);
      added = true;
    }
  }
  return { words: out, added, notes };
}

export function copyList(words: readonly string[], pending: string): string[] {
  const all = [...words];
  for (const part of splitParts(pending)) {
    const word = part.trim();
    if (word && !hasWord(all, word)) all.push(word);
  }
  return all;
}

export interface Typo {
  readonly word: string;
  readonly fix: string;
}

const TYPO_LIST_MAX = 5;

export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const rows = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1])
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      rows[i][j] = best;
    }
  return rows[x.length][y.length];
}

export function closeSuggestion(
  word: string,
  suggestions: readonly string[],
): string | null {
  const key = word.toLowerCase();
  const limit = [...key].length >= 6 ? 2 : 1;
  for (const suggestion of suggestions) {
    if (/\s/.test(suggestion)) continue;
    const distance = editDistance(key, suggestion.toLowerCase());
    if (distance > 0 && distance <= limit) return suggestion;
  }
  return null;
}

export async function findTypos(
  words: readonly string[],
  suggest: (word: string) => Promise<string[]>,
): Promise<Typo[]> {
  const fixes = await Promise.all(
    words.map(async (word) =>
      closeSuggestion(word, await suggest(word).catch(() => [])),
    ),
  );
  return words.flatMap((word, index) => {
    const fix = fixes[index];
    return fix ? [{ word, fix }] : [];
  });
}

export function typoNote(typos: readonly Typo[]): string {
  const shown = typos
    .slice(0, TYPO_LIST_MAX)
    .map(({ word, fix }) => "«" + word + "» → «" + fix + "»");
  if (typos.length > TYPO_LIST_MAX) shown.push("…");
  return (
    "Алдаатай бичсэн байж магадгүй: " +
    shown.join(", ") +
    ". Буруу үгийг × дарж хасна уу. Зөв гэдэгт итгэлтэй бол «Илгээх»-ийг дахин дарна уу."
  );
}
