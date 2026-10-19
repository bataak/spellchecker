import type { LookupMode } from "../dict/stardict.ts";
import type { SpellerInstance } from "./backend.ts";
import { englishStems } from "./lookup.ts";
import type { Speller } from "./spellers.ts";
import { dashNormalized, isLexicalHyphen } from "./textcheck.ts";
import {
  bareStemInfinitives,
  collectiveGenitive,
  lookupCandidates,
  parseAnalyses,
  type Analysis,
} from "./verbform.ts";
import { attempt } from "../attempt.ts";

export interface WordCheckDeps {
  readonly primary: () => SpellerInstance | undefined;
  readonly active: () => Speller[];
}

export interface WordCheck {
  isCorrect(word: string): boolean;
  suggest(word: string): string[];
  analysesFor(word: string): Analysis[];
  stemsOf(word: string): string[];
  infinitivesOfStem(word: string): string[];
  lookupModeOf(word: string): LookupMode;
}

const LATIN_WORD = /\p{Script=Latin}/u;
const STARTS_UPPER = /^\p{Lu}/u;
const CYRILLIC = /[Ѐ-ӿ᠀-᢯]/;
const LATIN = /[A-Za-z]/;
const ENGLISH_IDS: ReadonlySet<string> = new Set(["en_US", "en_GB"]);
const SUGGEST_CACHE_MAX = 200;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function analysesOf(inst: SpellerInstance, word: string): Analysis[] {
  if (inst.analyze) {
    const parsed = parseAnalyses(stringList(inst.analyze(word)));
    if (parsed.length) return parsed;
  }
  if (!inst.stem) return [];
  return stringList(inst.stem(word)).map((stem) => ({ stem, verb: null }));
}

function spells(inst: SpellerInstance, candidate: string): boolean {
  try {
    return inst.spell(candidate);
  } catch {
    return false;
  }
}

function collectiveBase(inst: SpellerInstance, word: string): string | null {
  const genitive = collectiveGenitive(word);
  return genitive && spells(inst, genitive) ? genitive : null;
}

export function createWordCheck(deps: WordCheckDeps): WordCheck {
  const suggestCache = new WeakMap<SpellerInstance, Map<string, string[]>>();

  function englishStemsOf(word: string): string[] {
    const english = deps.active().filter(({ id }) => ENGLISH_IDS.has(id));
    const lower = word.toLowerCase();
    const out: string[] = [];
    const add = (stem: string): void => {
      if (stem && stem !== word && stem !== lower && !out.includes(stem))
        out.push(stem);
    };
    for (const { inst } of english) {
      if (!inst.stem) continue;
      const stem = inst.stem.bind(inst);
      for (const form of [word, lower])
        attempt(() => stringList(stem(form)), []).forEach(add);
    }
    if (out.length) return out;
    const rules = englishStems(word);
    if (!english.length) return rules;
    return rules.filter((stem) =>
      english.some(({ inst }) => spells(inst, stem)),
    );
  }

  function isLexicalCompound(word: string): boolean {
    const primary = deps.primary();
    if (!primary?.analyze || !primary.spell(word)) return false;
    return isLexicalHyphen(stringList(primary.analyze(word)));
  }

  function cachedSuggest(inst: SpellerInstance, word: string): string[] {
    let memo = suggestCache.get(inst);
    if (!memo) {
      memo = new Map();
      suggestCache.set(inst, memo);
    }
    const hit = memo.get(word);
    if (hit) {
      memo.delete(word);
      memo.set(word, hit);
      return hit;
    }
    const result = inst.suggest(word) || [];
    memo.set(word, result);
    if (memo.size > SUGGEST_CACHE_MAX) memo.delete(memo.keys().next().value!);
    return result;
  }

  return {
    isCorrect(word) {
      const hyphened = dashNormalized(word);
      if (hyphened !== null) return !isLexicalCompound(hyphened);
      const list = deps.active();
      if (!list.length) return true;
      const cyr = CYRILLIC.test(word);
      const lat = LATIN.test(word);
      if (lat && !cyr && !list.some((item) => item.id.startsWith("en")))
        return true;
      if (cyr && !lat && !list.some((item) => item.id.startsWith("mn")))
        return true;
      return list.some(({ inst }) => inst.spell(word));
    },

    suggest(word) {
      const base = deps.active();
      const cyr = CYRILLIC.test(word);
      const lat = LATIN.test(word);
      let list = base;
      if (cyr && !lat) {
        list = base.filter(({ id }) => id.startsWith("mn"));
      } else if (lat && !cyr) {
        list = base.filter(({ id }) => id.startsWith("en"));
      }
      if (!list.length) list = base;

      const seen = new Set<string>();
      const out: string[] = [];
      for (const { inst } of list) {
        for (const suggestion of cachedSuggest(inst, word)) {
          if (!seen.has(suggestion)) {
            seen.add(suggestion);
            out.push(suggestion);
          }
        }
      }
      return out;
    },

    analysesFor(word) {
      if (LATIN_WORD.test(word)) return [];
      const primary = deps.primary();
      if (!primary) return [];
      try {
        const analyses = analysesOf(primary, word);
        const genitive = collectiveBase(primary, word);
        return genitive
          ? [...analyses, ...analysesOf(primary, genitive)]
          : analyses;
      } catch {
        return [];
      }
    },

    stemsOf(word) {
      if (LATIN_WORD.test(word)) return englishStemsOf(word);
      const primary = deps.primary();
      if (!primary) return [];
      try {
        const isWord = (candidate: string) => spells(primary, candidate);
        const candidates = lookupCandidates(
          word,
          analysesOf(primary, word),
          isWord,
        );
        const genitive = collectiveBase(primary, word);
        if (!genitive) return candidates;
        const all = [
          ...candidates,
          ...lookupCandidates(genitive, analysesOf(primary, genitive), isWord),
        ];
        return all.filter((item, position) => all.indexOf(item) === position);
      } catch {
        return [];
      }
    },

    infinitivesOfStem(word) {
      if (LATIN_WORD.test(word)) return [];
      const primary = deps.primary();
      if (!primary) return [];
      try {
        return bareStemInfinitives(
          word,
          analysesOf(primary, word),
          (candidate) => spells(primary, candidate),
        );
      } catch {
        return [];
      }
    },

    lookupModeOf(word) {
      if (!STARTS_UPPER.test(word) || LATIN_WORD.test(word)) return "any";
      const primary = deps.primary();
      if (!primary) return "any";
      try {
        return primary.spell(word.toLowerCase()) ? "any" : "proper";
      } catch {
        return "any";
      }
    },
  };
}
