import { KEYS, readJson, writeJson } from "../core/store.ts";
type CasePattern = "lower" | "capital" | "upper";
const REACH: Record<CasePattern, number> = { upper: 0, capital: 1, lower: 2 };

const FOREIGN_STEM =
  /^(\P{Script=Cyrillic}*(?!\p{Script=Cyrillic})\p{L}\P{Script=Cyrillic}*?)[-\u2010\u2011](?=\p{Ll})[\u0400-\u04FF]+$/u;

const CASE_ENDING =
  "ийн|ын|ний|ны|гийн|ий|ы|ийг|ыг|г|д|т|ад|эд|од|өд|нд|аас|ээс|оос|өөс|иас|иэс|гаас|гээс|гоос|гөөс|наас|нээс|ноос|нөөс|аар|ээр|оор|өөр|иар|иэр|гаар|гээр|гоор|гөөр|тай|тэй|той|руу|рүү|луу|лүү";
const REFLEXIVE = "г?аа|г?ээ|г?оо|г?өө";
const CASE_SUFFIX = new RegExp(
  `^(.+?)[-\\u2010\\u2011](?:(?:${CASE_ENDING})(?:х(?:[эаоө]?н)?(?:${CASE_ENDING})?)?(?:${REFLEXIVE})?|${REFLEXIVE})$`,
  "u",
);

export function ignoreStem(word: string): string {
  return FOREIGN_STEM.exec(word)?.[1] ?? CASE_SUFFIX.exec(word)?.[1] ?? word;
}

function isMixedScript(word: string): boolean {
  return /\p{Script=Cyrillic}/u.test(word) && /\p{Script=Latin}/u.test(word);
}

export function ignoreParts(word: string): string[] {
  const pieces = word.trim().normalize("NFC").split(".");
  return pieces
    .map(ignoreStem)
    .filter(
      (piece, at) => [...piece].length > (at === pieces.length - 1 ? 1 : 2),
    );
}

export function canIgnore(word: string): boolean {
  const parts = ignoreParts(word);
  return parts.length > 0 && !parts.some(isMixedScript);
}

function caseOf(word: string): CasePattern {
  let upper = 0,
    lower = 0,
    firstCased: string | null = null;
  for (const ch of word) {
    const upperChar = ch.toUpperCase(),
      lowerChar = ch.toLowerCase();
    if (upperChar === lowerChar) continue;
    if (firstCased === null) firstCased = ch;
    if (ch === upperChar) upper++;
    else lower++;
  }
  if (upper === 0) return "lower";
  if (lower === 0) return "upper";
  if (firstCased && firstCased === firstCased.toUpperCase()) return "capital";
  return "lower";
}

export interface IgnoreList {
  isIgnored(word: string): boolean;
  add(word: string): boolean;
  remove(word: string): boolean;
  clear(): boolean;
  list(): string[];
  onChange(listener: () => void): void;
}

function storedWords(): string[] {
  const parsed = readJson(KEYS.ignored);
  return Array.isArray(parsed)
    ? [
        ...new Set(
          parsed
            .filter((w): w is string => typeof w === "string" && canIgnore(w))
            .flatMap(ignoreParts),
        ),
      ]
    : [];
}

export function createIgnoreList(): IgnoreList {
  let ignored: string[] = [];
  let lookup = new Map<string, CasePattern>();
  let loaded = false;
  const listeners = new Set<() => void>();

  const rebuild = (): void => {
    lookup = new Map();
    for (const word of ignored)
      lookup.set(word.normalize("NFC").toLowerCase(), caseOf(word));
  };
  const load = (): void => {
    ignored = storedWords();
    loaded = true;
    rebuild();
  };
  const ensure = (): void => {
    if (!loaded) load();
  };
  const commit = (): true => {
    rebuild();
    writeJson(KEYS.ignored, ignored);
    return true;
  };
  const matches = (word: string): boolean => {
    const stored = lookup.get(word.normalize("NFC").toLowerCase());
    if (stored === undefined) return false;
    if (stored === "lower") return true;
    const wordCase = caseOf(word);
    if (stored === "capital")
      return wordCase === "capital" || wordCase === "upper";
    return wordCase === "upper";
  };
  const addPart = (part: string): boolean => {
    load();
    const key = part.toLowerCase();
    const existing = lookup.get(key);
    if (existing !== undefined) {
      if (REACH[existing] >= REACH[caseOf(part)]) return false;
      ignored = ignored.filter(
        (stored) => stored.normalize("NFC").toLowerCase() !== key,
      );
    }
    ignored.push(part);
    return commit();
  };
  const watchStorage = (): void => {
    if (typeof window === "undefined") return;
    window.addEventListener("storage", (event) => {
      if (event.key !== KEYS.ignored.name && event.key !== null) return;
      load();
      for (const listener of listeners) listener();
    });
  };

  return {
    isIgnored(word) {
      ensure();
      if (matches(word)) return true;
      if (!/[-.\u2010\u2011]/.test(word)) return false;
      const parts = ignoreParts(word);
      return parts.length > 0 && parts.every(matches);
    },
    add(word) {
      if (!canIgnore(word)) return false;
      let added = false;
      for (const part of ignoreParts(word)) added = addPart(part) || added;
      return added;
    },
    remove(word) {
      load();
      const before = ignored.length;
      ignored = ignored.filter((stored) => stored !== word);
      return ignored.length !== before && commit();
    },
    clear() {
      load();
      if (!ignored.length) return false;
      ignored = [];
      return commit();
    },
    list() {
      ensure();
      return ignored.slice();
    },
    onChange(listener) {
      if (!listeners.size) watchStorage();
      listeners.add(listener);
    },
  };
}

const shared = createIgnoreList();

export const isIgnored = (word: string): boolean => shared.isIgnored(word);
export const addIgnored = (word: string): boolean => shared.add(word);
export const removeIgnored = (word: string): boolean => shared.remove(word);
export const clearIgnored = (): boolean => shared.clear();
export const getIgnored = (): string[] => shared.list();
export const onIgnoredChange = (listener: () => void): void =>
  shared.onChange(listener);
