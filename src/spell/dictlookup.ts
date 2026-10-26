import type { WordCheck } from "./wordcheck.ts";
import { standardLetters } from "../lang/letters.ts";
import {
  findHeadword,
  findTaggedHeadword,
  resolveDefinitions,
  resolveTagged,
  type DictEntry,
  type LookupMode,
  type StarDict,
} from "../dict/stardict.ts";
import { DictReadError } from "../dict/stardictload.ts";
import type { StarDictStore } from "../dict/stardictstore.ts";

export interface DictLookupDeps {
  readonly store: Pick<StarDictStore, "withDicts">;
  readonly words: Pick<
    WordCheck,
    "analysesFor" | "stemsOf" | "infinitivesOfStem" | "lookupModeOf"
  >;
}

export interface DictLookup {
  headwords(words: readonly string[]): Promise<Record<string, string> | null>;
  define(word: string): Promise<DictEntry[]>;
}

const MAX_DEFINITIONS = 12;

async function inDict<T>(
  dict: StarDict,
  broken: StarDict[],
  run: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof DictReadError) broken.push(dict);
    else console.warn("StarDict хайлт амжилтгүй:", dict.info.bookname, err);
    return fallback;
  }
}

export function createDictLookup(deps: DictLookupDeps): DictLookup {
  const { store, words } = deps;

  async function headwordIn(
    dict: StarDict,
    word: string,
    mode: LookupMode,
  ): Promise<string | null> {
    return dict.info.posTagged
      ? await findTaggedHeadword(
          dict,
          word,
          () => words.analysesFor(word),
          mode,
        )
      : findHeadword(dict, word, () => words.stemsOf(word), mode);
  }

  async function definitionsIn(
    dict: StarDict,
    word: string,
    mode: LookupMode,
  ): Promise<DictEntry[]> {
    const found = dict.info.posTagged
      ? await resolveTagged(dict, word, () => words.analysesFor(word), mode)
      : await resolveDefinitions(
          dict,
          word,
          () => words.stemsOf(word),
          mode,
          () => words.infinitivesOfStem(word),
        );
    const label = dict.info.bookname;
    return found.map((entry) => ({ ...entry, source: label }));
  }

  return {
    headwords(list) {
      return store.withDicts(async (dicts, broken) => {
        if (!dicts.length) return null;
        const out: Record<string, string> = {};
        for (const raw of list) {
          const word = standardLetters(raw);
          const mode = words.lookupModeOf(word);
          for (const dict of dicts) {
            const headword = await inDict(
              dict,
              broken,
              () => headwordIn(dict, word, mode),
              null,
            );
            if (headword != null) {
              out[raw] = headword;
              break;
            }
          }
        }
        return out;
      });
    },

    define(word) {
      const mode = words.lookupModeOf(word);
      return store.withDicts(async (dicts, broken) => {
        const out: DictEntry[] = [];
        for (const dict of dicts) {
          if (out.length >= MAX_DEFINITIONS) break;
          const found = await inDict(
            dict,
            broken,
            () => definitionsIn(dict, word, mode),
            [],
          );
          out.push(...found.slice(0, MAX_DEFINITIONS - out.length));
        }
        return out;
      });
    },
  };
}
