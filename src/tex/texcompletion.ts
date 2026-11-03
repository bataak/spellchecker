import { isAsciiLetter } from "../core/text.ts";
import { TexSource } from "./texsource.ts";
import { argContext, type ArgContext } from "./texargs.ts";
import { COMMANDS, ENVIRONMENTS } from "./texcommands.ts";
import { NO_SYMBOLS, type TexSymbols } from "./texsymbols.ts";

export type CompletionKind = "cmd" | "env" | "arg";

export type CompletionContext =
  | {
      readonly kind: "cmd" | "env";
      readonly from: number;
      readonly prefix: string;
    }
  | ArgContext;

export interface Completion {
  label: string;
  snippet: string;
}

export interface Expansion {
  from: number;
  to: number;
  text: string;
  caret: number;
  closes: number[];
  body: number | null;
}

const LIMIT = 8;
const LIST_ENVS = new Set(["itemize", "enumerate", "description"]);
const ITEM = "\\item ";
const ENV_BEGIN = /\\begin\s*\{[^{}\n]*\}/g;
const ENV_END = /\\end\s*\{[^{}\n]*\}/g;

function entry(snippet: string): Completion {
  const cut = snippet.search(/[{[(<#]|\)$|\]$/);
  const name = cut <= 0 ? snippet.trimEnd() : snippet.slice(0, cut);
  const star = snippet.startsWith(name + "*") ? "*" : "";
  return { label: name + star, snippet };
}

function envEntry(snippet: string): Completion {
  const cut = snippet.search(/[{[]/);
  return { label: cut < 0 ? snippet : snippet.slice(0, cut), snippet };
}

const COMMAND_LIST = dedupe(COMMANDS.map(entry));
const ENV_LIST = ENVIRONMENTS.map(envEntry);

function dedupe(list: Completion[]): Completion[] {
  const out: Completion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = item.label + "\u0000" + item.snippet;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function completionContext(
  text: string,
  caret: number,
): CompletionContext | null {
  const found = typedContext(text, caret);
  if (!found) return null;
  const closesEnv =
    found.kind === "env" && text.slice(found.from - 5, found.from) === "\\end{";
  return closesEnv || !TexSource.of(text).insideCode(caret) ? found : null;
}

function typedContext(text: string, caret: number): CompletionContext | null {
  if (caret < 1 || caret > text.length) return null;
  if (caret < text.length && isAsciiLetter(text.charCodeAt(caret))) return null;

  let start = caret;
  while (start > 0 && isAsciiLetter(text.charCodeAt(start - 1))) start--;

  const env = /\\(?:begin|end)\{([A-Za-z]*\*?)$/.exec(
    text.slice(Math.max(0, start - 8), caret),
  );
  if (env && text.charCodeAt(caret - 1) !== 42) {
    const from = caret - env[1]!.length;
    if (TexSource.of(text).inComment(from)) return null;
    return { kind: "env", from, prefix: env[1]! };
  }

  const command = commandContext(text, start, caret);
  if (command) return command;
  const arg = argContext(text, caret);
  return arg && !TexSource.of(text).inComment(arg.from) ? arg : null;
}

function commandContext(
  text: string,
  start: number,
  caret: number,
): CompletionContext | null {
  if (start === caret) return null;
  if (start < 1 || text.charCodeAt(start - 1) !== 92) return null;
  let slashes = 0;
  for (let i = start - 1; i >= 0 && text.charCodeAt(i) === 92; i--) slashes++;
  if (slashes % 2 === 0) return null;
  if (TexSource.of(text).inComment(start - 1)) return null;
  return { kind: "cmd", from: start - 1, prefix: text.slice(start, caret) };
}

function rank(list: readonly Completion[], prefix: string): Completion[] {
  const exact: Completion[] = [];
  const starts: Completion[] = [];
  const folded: Completion[] = [];
  const lower = prefix.toLowerCase();
  for (const item of list) {
    if (item.label === prefix) exact.push(item);
    else if (item.label.startsWith(prefix)) starts.push(item);
    else if (item.label.toLowerCase().startsWith(lower)) folded.push(item);
  }
  return [...exact, ...starts, ...folded].slice(0, LIMIT);
}

const COMMAND_LABELS = new Set(COMMAND_LIST.map((item) => item.label));
const ENV_LABELS = new Set(ENV_LIST.map((item) => item.label));

function own(
  snippets: readonly string[],
  toEntry: (snippet: string) => Completion,
  known: ReadonlySet<string>,
): Completion[] {
  return snippets.map(toEntry).filter((item) => !known.has(item.label));
}

function candidates(
  context: CompletionContext,
  symbols: TexSymbols,
): readonly Completion[] {
  if (context.kind === "arg")
    return symbols[context.source].map((value) => ({
      label: value,
      snippet: value,
    }));
  if (context.kind === "env")
    return [...ENV_LIST, ...own(symbols.environments, envEntry, ENV_LABELS)];
  return [...own(symbols.commands, entry, COMMAND_LABELS), ...COMMAND_LIST];
}

export function completions(
  context: CompletionContext,
  symbols: TexSymbols = NO_SYMBOLS,
): Completion[] {
  const found = rank(candidates(context, symbols), context.prefix);
  if (context.kind === "env") return found;
  const only = found.length === 1 ? found[0]! : null;
  if (only?.label === context.prefix && only.snippet === only.label) return [];
  return found;
}

export function unchanged(
  context: CompletionContext,
  item: Completion,
): boolean {
  return (
    context.kind !== "env" &&
    item.snippet === item.label &&
    item.label === context.prefix
  );
}

export function lineIndent(text: string, at: number): string {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, at));
  return match ? match[0] : "";
}

export function keepsArgument(
  text: string,
  caret: number,
  item: Completion,
): boolean {
  const rest = item.snippet.slice(item.label.length);
  return text[caret] === "{" && /^[{[]/.test(rest);
}

function environmentClosed(text: string): boolean {
  return (
    TexSource.of(text).matches(ENV_END).length >=
    TexSource.of(text).matches(ENV_BEGIN).length
  );
}

function bare(from: number, to: number, inserted: string): Expansion {
  return {
    from,
    to,
    text: inserted,
    caret: from + inserted.length,
    closes: [],
    body: null,
  };
}

export function expand(
  text: string,
  caret: number,
  context: CompletionContext,
  item: Completion,
): Expansion {
  if (context.kind === "arg") return bare(context.from, caret, item.label);
  if (context.kind === "cmd") {
    if (keepsArgument(text, caret, item))
      return bare(context.from, caret, "\\" + item.label);
    const body = "\\" + item.snippet;
    const mark = body.indexOf("#");
    const inserted =
      mark < 0 ? body : body.slice(0, mark) + body.slice(mark + 1);
    return {
      from: context.from,
      to: caret,
      text: inserted,
      caret: context.from + (mark < 0 ? inserted.length : mark),
      closes: mark < 0 ? [] : groupCloses(inserted, mark, context.from),
      body: null,
    };
  }

  const opener = text.slice(Math.max(0, context.from - 7), context.from);
  const closing = text.charCodeAt(caret) === 125;
  const to = closing ? caret + 1 : caret;
  const name = item.label;
  const extra = item.snippet.slice(name.length);

  if (opener.endsWith("\\end{") || (closing && environmentClosed(text)))
    return bare(context.from, to, name + "}");

  const indent = lineIndent(text, context.from);
  const mark = extra.indexOf("#");
  const head = name + "}" + (mark < 0 ? extra : extra.replace("#", ""));
  const lead = LIST_ENVS.has(name) ? ITEM : "";
  const inner = "\n" + indent + "  " + lead;
  const inserted = head + inner + "\n" + indent + "\\end{" + name + "}";
  const caretAt =
    mark < 0
      ? context.from + head.length + inner.length
      : context.from + name.length + 1 + mark;
  if (mark < 0) return { ...bare(context.from, to, inserted), caret: caretAt };
  return {
    from: context.from,
    to,
    text: inserted,
    caret: caretAt,
    closes: groupCloses(head, name.length + 1 + mark, context.from),
    body: context.from + head.length + inner.length,
  };
}

function groupCloses(text: string, mark: number, offset: number): number[] {
  const out: number[] = [];
  for (let i = mark; i < text.length; i++)
    if (text[i] === "}" || text[i] === "]") out.push(offset + i);
  return out;
}
