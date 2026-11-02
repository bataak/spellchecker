import type { Expansion } from "./texcompletion.ts";
import { liveMatches } from "./texliteral.ts";
import type { MenuSection } from "./texmenudata.ts";
import { uncommented } from "./texproject.ts";

interface PackageRule {
  readonly name: string;
  readonly uses: RegExp;
  readonly loaded: RegExp;
  readonly setup?: string;
}

interface TheoremEnv {
  readonly name: string;
  readonly title: string;
  readonly style: "plain" | "definition" | "remark";
  readonly inBeamer: boolean;
}

const AMS_ENVS =
  "align|alignat|flalign|gather|gathered|multline|aligned|split|cases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|subequations";

const PACKAGES: readonly PackageRule[] = [
  {
    name: "amsmath",
    uses: new RegExp(
      "\\\\begin\\{(?:(?:" +
        AMS_ENVS +
        ")\\*?|equation\\*)\\}|\\\\(?:text|binom|dbinom|tbinom|eqref|dfrac|tfrac|iint|iiint|implies|iff|boldsymbol|operatorname)(?![A-Za-z])",
    ),
    loaded: /\b(?:amsmath|mathtools)\b/,
  },
  {
    name: "amssymb",
    uses: /\\(?:mathbb|square|therefore|because)(?![A-Za-z])/,
    loaded: /\bamssymb\b/,
  },
  {
    name: "graphicx",
    uses: /\\includegraphics(?![A-Za-z])/,
    loaded: /\bgraphicx\b/,
  },
  {
    name: "hyperref",
    uses: /\\href(?![A-Za-z])/,
    loaded: /\bhyperref\b/,
  },
  {
    name: "hyperref",
    uses: /\\url(?![A-Za-z])/,
    loaded: /\b(?:hyperref|url|xurl)\b/,
  },
  {
    name: "makeidx",
    uses: /\\printindex(?![A-Za-z])/,
    loaded: /\b(?:makeidx|imakeidx)\b/,
    setup: "\\makeindex",
  },
  {
    name: "amsthm",
    uses: /\\begin\{(?:theorem|lemma|definition|example|remark|proof)\}/,
    loaded: /\bamsthm\b/,
  },
];

export const THEOREM_ENVS: readonly TheoremEnv[] = [
  { name: "theorem", title: "Теорем", style: "plain", inBeamer: true },
  { name: "lemma", title: "Лемм", style: "plain", inBeamer: true },
  {
    name: "definition",
    title: "Тодорхойлолт",
    style: "definition",
    inBeamer: true,
  },
  { name: "example", title: "Жишээ", style: "definition", inBeamer: true },
  { name: "remark", title: "Тайлбар", style: "remark", inBeamer: false },
];

const DOCUMENT_CLASS = /\\documentclass\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/;
const BEGIN_DOCUMENT = /\\begin\s*\{document\}/g;
const USED_PACKAGES =
  /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g;
const NO_CHAPTERS =
  /^(?:article|scrartcl|beamer|letter|scrlttr2|amsart|minimal|standalone|proc)$/;
const CHAPTER_SNIPPET = /^chapter\b/;

function documentClass(text: string): string | null {
  return DOCUMENT_CLASS.exec(uncommented(text))?.[1]?.trim() ?? null;
}

export function theoremDefined(text: string, name: string): boolean {
  return new RegExp("\\\\newtheorem\\*?\\s*\\{" + name + "\\}").test(text);
}

export function theoremLines(env: TheoremEnv): string[] {
  return [
    "\\theoremstyle{" + env.style + "}",
    "\\newtheorem{" + env.name + "}{" + env.title + "}",
  ];
}

function missingPackages(preamble: string, inserted: string): string[] {
  const loaded = [...preamble.matchAll(USED_PACKAGES)]
    .map((match) => match[1]!)
    .join(",");
  const lines = PACKAGES.filter(
    (rule) => rule.uses.test(inserted) && !rule.loaded.test(loaded),
  ).flatMap((rule) => [
    "\\usepackage{" + rule.name + "}",
    ...(rule.setup ? [rule.setup] : []),
  ]);
  return [...new Set(lines)];
}

function missingTheorems(
  preamble: string,
  inserted: string,
  beamer: boolean,
): string[] {
  return THEOREM_ENVS.filter(
    (env) =>
      inserted.includes("\\begin{" + env.name + "}") &&
      !(beamer && env.inBeamer) &&
      !theoremDefined(preamble, env.name),
  ).flatMap(theoremLines);
}

export function preambleEdit(text: string, inserted: string): Expansion | null {
  const documentType = documentClass(text);
  const at = liveMatches(text, BEGIN_DOCUMENT)[0]?.index;
  if (documentType === null || at === undefined) return null;
  const preamble = uncommented(text.slice(0, at));
  const beamer = documentType === "beamer";
  const lines = [
    ...(beamer ? [] : missingPackages(preamble, inserted)),
    ...missingTheorems(preamble, inserted, beamer),
  ];
  if (!lines.length) return null;
  const added = lines.join("\n") + "\n";
  return {
    from: at,
    to: at,
    text: added,
    caret: at + added.length,
    closes: [],
    body: null,
  };
}

export function placeAfter(edit: Expansion, setup: Expansion): Expansion {
  if (edit.from < setup.from) return edit;
  const delta = setup.text.length;
  return {
    ...edit,
    from: edit.from + delta,
    to: edit.to + delta,
    caret: edit.caret + delta,
    closes: edit.closes.map((close) => close + delta),
    body: edit.body === null ? null : edit.body + delta,
  };
}

export function sectionsFor(
  sections: readonly MenuSection[],
  text: string,
): readonly MenuSection[] {
  const type = documentClass(text);
  if (type === null || !NO_CHAPTERS.test(type)) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.filter(
      ({ insert }) =>
        insert.kind !== "cmd" || !CHAPTER_SNIPPET.test(insert.snippet),
    ),
  }));
}
