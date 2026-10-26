import { uncommented } from "./texproject.ts";

export type ArgSource = "label" | "cite" | "index";

export interface TexSymbols {
  readonly label: readonly string[];
  readonly cite: readonly string[];
  readonly index: readonly string[];
  readonly commands: readonly string[];
  readonly environments: readonly string[];
}

export type TexSource = readonly [path: string, text: string];

export const NO_SYMBOLS: TexSymbols = {
  label: [],
  cite: [],
  index: [],
  commands: [],
  environments: [],
};

const LABEL = /\\label\s*\{([^{}]+)\}/g;
const BIBITEM = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g;
const BIB_ENTRY = /@([A-Za-z]+)\s*[{(]\s*([^,\s{}()]+)\s*,/g;
const BIB_META = new Set(["string", "comment", "preamble"]);
const INDEX = /\\index\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const INDEX_KEY = /^(?:"[\s\S]|[^"|])*/;
const COMMAND =
  /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\*?\s*\{?\s*\\([A-Za-z]+)\s*\}?\s*(?:\[(\d)\])?/g;
const OPERATOR = /\\DeclareMathOperator\*?\s*\{\s*\\([A-Za-z]+)\s*\}/g;
const DEF = /\\(?:def|let)\s*\\([A-Za-z]+)/g;
const ENVIRONMENT =
  /\\(?:newenvironment|renewenvironment)\*?\s*\{([A-Za-z]+\*?)\}\s*(?:\[(\d)\])?/g;
const THEOREM = /\\newtheorem\*?\s*\{([A-Za-z]+)\}/g;
const BIB_FILE = /\.bib$/i;

function captures(text: string, pattern: RegExp, group = 1): string[] {
  return [...text.matchAll(pattern)].map((match) => match[group]!.trim());
}

function withArgs(name: string, count: string | undefined): string {
  const args = Number(count ?? 0);
  return args > 0 ? name + "{#}" + "{}".repeat(args - 1) : name;
}

function bibKeys(text: string): string[] {
  return [...text.matchAll(BIB_ENTRY)]
    .filter((match) => !BIB_META.has(match[1]!.toLowerCase()))
    .map((match) => match[2]!);
}

function scanTex(text: string): TexSymbols {
  const body = uncommented(text);
  return {
    label: captures(body, LABEL),
    cite: captures(body, BIBITEM),
    index: captures(body, INDEX)
      .map((raw) => INDEX_KEY.exec(raw)![0].trim())
      .filter(Boolean),
    commands: [
      ...[...body.matchAll(COMMAND)].map((m) => withArgs(m[1]!, m[2])),
      ...captures(body, OPERATOR),
      ...captures(body, DEF),
    ],
    environments: [
      ...[...body.matchAll(ENVIRONMENT)].map((m) => withArgs(m[1]!, m[2])),
      ...captures(body, THEOREM),
    ],
  };
}

export function scanSource(path: string, text: string): TexSymbols {
  return BIB_FILE.test(path)
    ? { ...NO_SYMBOLS, cite: bibKeys(text) }
    : scanTex(text);
}

function distinct(lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat())];
}

export function mergeSymbols(parts: readonly TexSymbols[]): TexSymbols {
  const field = (key: keyof TexSymbols): string[] =>
    distinct(parts.map((part) => part[key]));
  return {
    label: field("label"),
    cite: field("cite"),
    index: field("index"),
    commands: field("commands"),
    environments: field("environments"),
  };
}

export interface SymbolIndex {
  collect(sources: Iterable<TexSource>): TexSymbols;
}

interface Scanned {
  readonly text: string;
  readonly symbols: TexSymbols;
}

export function createSymbolIndex(): SymbolIndex {
  const cache = new Map<string, Scanned>();
  return {
    collect(sources) {
      const seen = new Set<string>();
      const parts: TexSymbols[] = [];
      for (const [path, text] of sources) {
        let hit = cache.get(path);
        if (hit?.text !== text) {
          hit = { text, symbols: scanSource(path, text) };
          cache.set(path, hit);
        }
        seen.add(path);
        parts.push(hit.symbols);
      }
      for (const path of cache.keys()) if (!seen.has(path)) cache.delete(path);
      return mergeSymbols(parts);
    },
  };
}
