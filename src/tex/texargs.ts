import type { ArgSource } from "./texsymbols.ts";

export interface ArgContext {
  readonly kind: "arg";
  readonly source: ArgSource;
  readonly from: number;
  readonly prefix: string;
}

const LABEL_COMMANDS = [
  "ref",
  "eqref",
  "pageref",
  "autoref",
  "nameref",
  "vref",
  "cref",
  "Cref",
  "labelcref",
];
const CITE_COMMANDS = [
  "cite",
  "citep",
  "citet",
  "citealp",
  "citealt",
  "citeauthor",
  "citeyear",
  "parencite",
  "textcite",
  "autocite",
  "footcite",
  "smartcite",
  "fullcite",
  "nocite",
];
const LIST_COMMANDS = new Set([...CITE_COMMANDS, "cref", "Cref", "labelcref"]);

const SOURCES = new Map<string, ArgSource>([
  ...LABEL_COMMANDS.map((name) => [name, "label"] as const),
  ...CITE_COMMANDS.map((name) => [name, "cite"] as const),
  ["index", "index"],
]);

const OPEN_ARG = /\\([A-Za-z]+)\*?(?:\s*\[[^\]\n]*\])*\s*\{([^{}\n]*)$/;

function escaped(text: string, at: number): boolean {
  let slashes = 0;
  for (let i = at - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

export function argContext(text: string, caret: number): ArgContext | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(lineStart, caret);
  const match = OPEN_ARG.exec(line);
  if (!match || escaped(line, match.index)) return null;
  const name = match[1]!;
  const source = SOURCES.get(name);
  if (!source) return null;
  const typed = match[2]!;
  const cut = LIST_COMMANDS.has(name) ? typed.lastIndexOf(",") + 1 : 0;
  const lead = /^\s*/.exec(typed.slice(cut))![0].length;
  const from = caret - typed.length + cut + lead;
  return { kind: "arg", source, from, prefix: text.slice(from, caret) };
}
