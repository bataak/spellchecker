import { lineIndent, type Expansion } from "./texcompletion.ts";
import { uncommented } from "./texproject.ts";
import { lineStartAt } from "../core/text.ts";

export type Insert =
  | { readonly kind: "cmd" | "text"; readonly snippet: string }
  | {
      readonly kind: "env";
      readonly snippet: string;
      readonly body?: readonly string[];
      readonly around?: readonly [before: string, after: string];
    }
  | { readonly kind: "close" };

type EnvInsert = Extract<Insert, { kind: "env" }>;

const MARK = "#";
const STOP_CHARS = new Set(["}", "]", "$"]);
const EMPTY_OPEN = new Set(["{", "["]);
const ENV_EXTRA = /[{[]/;
const ENV_TAG = /\\(begin|end)\s*\{([^{}]+)\}/g;
const INNER_INDENT = "  ";
const COMMAND_NAME = /^[^{[_^ ]*/;
const SWITCH = /^\{(\\[A-Za-z]+) #\}$/;

function stopsAfter(text: string, from: number, offset: number): number[] {
  const out: number[] = [];
  for (let at = from; at < text.length; at += 1) {
    if (!STOP_CHARS.has(text[at]!)) continue;
    if (!out.length || EMPTY_OPEN.has(text[at - 1]!)) out.push(offset + at);
  }
  return out;
}

function needsSpace(raw: string, text: string, end: number): boolean {
  return /[A-Za-z]$/.test(raw) && /^[A-Za-z]/.test(text.slice(end));
}

function wrapEdit(
  raw: string,
  text: string,
  start: number,
  end: number,
): Expansion {
  const mark = raw.indexOf(MARK);
  if (mark < 0) {
    const inserted = needsSpace(raw, text, end) ? raw + " " : raw;
    return {
      from: start,
      to: end,
      text: inserted,
      caret: start + inserted.length,
      closes: [],
      body: null,
    };
  }
  const selected = text.slice(start, end);
  const inserted = raw.slice(0, mark) + selected + raw.slice(mark + 1);
  const inside = mark + selected.length;
  return {
    from: start,
    to: end,
    text: inserted,
    caret: start + inside,
    closes: stopsAfter(inserted, inside, start),
    body: null,
  };
}

function envEdit(
  insert: EnvInsert,
  text: string,
  start: number,
  end: number,
): Expansion {
  const cut = insert.snippet.search(ENV_EXTRA);
  const name = cut < 0 ? insert.snippet : insert.snippet.slice(0, cut);
  const extra = cut < 0 ? "" : insert.snippet.slice(cut);
  const indent = lineIndent(text, start);
  const lead = text.slice(lineStartAt(text, start), start).trim()
    ? "\n" + indent
    : "";
  const selected = text.slice(start, end);
  const lines = selected || !insert.body ? [selected] : insert.body;
  const [before, after] = insert.around ?? ["", ""];
  const head = lead + before + "\\begin{" + name + "}" + extra;
  const body = lines
    .map((line) => "\n" + indent + INNER_INDENT + line)
    .join("");
  const tail = "\n" + indent + "\\end{" + name + "}" + after;
  const raw = head + body + tail;
  const mark = selected ? head.indexOf(MARK) : raw.indexOf(MARK);
  const inserted = mark < 0 ? raw : raw.slice(0, mark) + raw.slice(mark + 1);
  const bodyEnd = head.length + body.length - (mark < 0 ? 0 : 1);
  const inHead = mark >= 0 && mark < head.length;
  const scope = inHead ? head.length - 1 : bodyEnd;
  return {
    from: start,
    to: end,
    text: inserted,
    caret: start + (mark < 0 ? bodyEnd : mark),
    closes: mark < 0 ? [] : stopsAfter(inserted.slice(0, scope), mark, start),
    body: inHead ? start + bodyEnd : null,
  };
}

function envTags(text: string): [tag: string, name: string][] {
  return [...uncommented(text).matchAll(ENV_TAG)].map(
    ([, tag, name]) => [tag!, name!.trim()] as [string, string],
  );
}

export function openEnvironment(before: string, after = ""): string | null {
  const open: string[] = [];
  for (const [tag, name] of envTags(before)) {
    if (tag === "begin") open.push(name);
    else if (open.at(-1) === name) open.pop();
  }
  const nested: string[] = [];
  for (const [tag, name] of envTags(after)) {
    if (tag === "begin") nested.push(name);
    else if (nested.at(-1) === name) nested.pop();
    else if (open.at(-1) === name) open.pop();
  }
  return open.at(-1) ?? null;
}

function beginIndent(text: string, name: string, before: number): string {
  const begin = text.lastIndexOf("\\begin{" + name + "}", before);
  return begin < 0 ? "" : lineIndent(text, begin);
}

function closeEdit(text: string, start: number): Expansion | null {
  const name = openEnvironment(text.slice(0, start), text.slice(start));
  if (name === null) return null;
  const indent = beginIndent(text, name, start);
  const lineStart = lineStartAt(text, start);
  const blank = !text.slice(lineStart, start).trim();
  const from = blank ? lineStart : start;
  const inserted = (blank ? "" : "\n") + indent + "\\end{" + name + "}";
  return {
    from,
    to: start,
    text: inserted,
    caret: from + inserted.length,
    closes: [],
    body: null,
  };
}

export function menuEdit(
  text: string,
  start: number,
  end: number,
  insert: Insert,
): Expansion | null {
  switch (insert.kind) {
    case "close":
      return closeEdit(text, start);
    case "env":
      return envEdit(insert, text, start, end);
    case "cmd":
      return wrapEdit("\\" + insert.snippet, text, start, end);
    case "text":
      return wrapEdit(insert.snippet, text, start, end);
  }
}

export function insertCode(insert: Insert): string {
  switch (insert.kind) {
    case "close":
      return "\\end{…}";
    case "env":
      return insert.snippet.split(ENV_EXTRA)[0]!;
    case "cmd":
      return "\\" + COMMAND_NAME.exec(insert.snippet)![0];
    case "text":
      return (
        SWITCH.exec(insert.snippet)?.[1] ??
        insert.snippet.replace(MARK, "…").replace(/\n/g, " ")
      );
  }
}
