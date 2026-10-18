import {
  checkWordsBatched,
  tokenize,
  type SpellChecker,
} from "./spellchecker.ts";
import {
  fencedCode,
  inRanges,
  skipRanges,
  type SkipRange,
} from "./codeskip.ts";
import { isIgnored } from "./ignore.ts";
import { checkable, dashCompound, dashSpan, type Token } from "./textcheck.ts";

const CHECK_NOTICE_MIN = 2000;
const CHECK_BATCH = 8000;
const LATIN_WORD = /\p{Script=Latin}/u;

export type Tokenized =
  ReturnType<typeof tokenize> extends Iterable<infer T> ? T : never;

export function tokenizeAll(text: string): Tokenized[] {
  return Array.from(tokenize(text), (item) => ({ ...item }));
}

export interface SpellSessionDeps {
  readonly checker: Pick<SpellChecker, "checkWords">;
  readonly markup: () => boolean;
  readonly isLatex: (text: string) => boolean;
  readonly progress: (message: string, animate: boolean) => Promise<void>;
}

export interface SpellSession {
  clear(): void;
  ensureChecked(text: string, tokens?: Iterable<Tokenized>): Promise<void>;
  correctNow(word: string): Promise<boolean>;
  computeBad(
    text: string,
    tokens?: Iterable<Tokenized>,
  ): { bad: Token[]; total: number };
  skipFor(text: string): SkipRange[];
  plainFences(text: string, word: string): SkipRange[];
}

export function createSpellSession(deps: SpellSessionDeps): SpellSession {
  const cache = new Map<string, boolean>();
  const isCorrect = (word: string): boolean => cache.get(word) ?? true;

  const skipFor = (text: string): SkipRange[] => {
    const latex = deps.isLatex(text);
    return skipRanges(text, {
      code: deps.markup() || latex,
      links: true,
      latex,
    });
  };

  return {
    clear: () => cache.clear(),

    async ensureChecked(text, tokens = tokenize(text)) {
      const need = new Set<string>();
      let prev: Tokenized | null = null;
      for (const token of tokens) {
        const { word, joined } = token;
        const probe = joined ?? word;
        if (checkable(word) && !cache.has(probe)) need.add(probe);
        const compound = prev && dashCompound(text, prev, token);
        if (compound && !cache.has(compound.word)) need.add(compound.word);
        prev = token;
      }
      if (!need.size) return;
      const words = [...need];
      const notify = words.length > CHECK_NOTICE_MIN;
      if (notify) await deps.progress("Алдааг шалгаж байна… 0%", true);
      const results = await checkWordsBatched(
        deps.checker,
        words,
        CHECK_BATCH,
        async (done, total) => {
          if (!notify) return;
          const pct = Math.floor((done / total) * 100);
          await deps.progress("Алдааг шалгаж байна… " + pct + "%", false);
        },
      );
      for (const [word, correct] of results) cache.set(word, correct);
    },

    async correctNow(word) {
      const known = cache.get(word);
      if (known !== undefined) return known;
      const checkResults = await deps.checker.checkWords([word]);
      const correct = checkResults[word] === true;
      cache.set(word, correct);
      return correct;
    },

    computeBad(text, tokens = tokenize(text)) {
      const bad: Token[] = [];
      const skip = skipFor(text);
      let total = 0;
      let prev: Tokenized | null = null;
      for (const token of tokens) {
        const { word, index, joined } = token;
        const left = prev;
        prev = token;
        total++;
        if (skip.length && inRanges(skip, index)) continue;
        const compound =
          left &&
          !inRanges(skip, left.index) &&
          dashCompound(text, left, token);
        if (
          compound &&
          !isCorrect(compound.word) &&
          !isIgnored(compound.word)
        ) {
          if (bad[bad.length - 1]?.start === compound.start) bad.pop();
          bad.push(compound);
          prev = null;
          continue;
        }
        if (!checkable(word) || isCorrect(joined ?? word) || isIgnored(word))
          continue;
        const span = dashSpan(text, { word, start: index });
        const last = bad[bad.length - 1];
        if (
          span &&
          !isIgnored(span.word) &&
          (!last || last.end <= span.start)
        ) {
          bad.push(span);
          continue;
        }
        bad.push({ word, start: index, end: index + word.length, joined });
      }
      return { bad, total };
    },

    skipFor,

    plainFences(text, word) {
      return deps.markup() || !LATIN_WORD.test(word) ? [] : fencedCode(text);
    },
  };
}
