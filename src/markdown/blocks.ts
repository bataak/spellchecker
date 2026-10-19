import {
  type Block,
  type Heading,
  type Inline,
  type LatexBlock,
  type ListLevel,
  type MathBlock,
  type MetaBlock,
  type MetaField,
} from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { HARD, inlineOf, parseInline } from "./inline.ts";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
export const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const PAGEBREAK_RE = /^\s*\\newpage\s*$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/;
const MATH_RE = /^\s*(?:\$\$|\\\[|\\begin\{[A-Za-z]+\*?\})/;

const MATH_ENVS = new Set(
  [
    "equation",
    "align",
    "gather",
    "multline",
    "displaymath",
    "flalign",
    "alignat",
    "aligned",
    "gathered",
    "split",
    "cases",
    "matrix",
    "pmatrix",
    "bmatrix",
    "Bmatrix",
    "vmatrix",
    "Vmatrix",
    "smallmatrix",
  ].flatMap((name) => [name, name + "*"]),
);

const TEXT_ENVS = new Set([
  "itemize",
  "enumerate",
  "description",
  "tabular",
  "table",
  "figure",
  "center",
  "flushleft",
  "flushright",
  "quote",
  "verbatim",
  "abstract",
  "proof",
  "theorem",
  "definition",
]);

export const MATH_CLOSE = { $$: "$$", "\\[": "\\]" } as const;

function envEnd(
  lines: readonly string[],
  start: number,
  env: string,
  math: boolean,
): number {
  const verbatim = env === "verbatim";
  const edge = verbatim
    ? /\\end\{verbatim\}/g
    : new RegExp("\\\\(begin|end)\\{" + env.replace("*", "\\*") + "\\}", "g");
  let depth = verbatim ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const line =
      verbatim && i === start ? raw.slice(raw.indexOf("}") + 1) : raw;
    if (math && i > start && !line.trim()) return -1;
    for (const m of line.matchAll(edge)) {
      depth += m[1] === "begin" ? 1 : -1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function displayMath(
  lines: readonly string[],
  start: number,
): { block: MathBlock | LatexBlock; next: number } | null {
  const head = lines[start]!.trim();
  const env = /^\\begin\{([A-Za-z]+\*?)\}/.exec(head)?.[1];
  if (env !== undefined) {
    const math = MATH_ENVS.has(env);
    if (!math && !TEXT_ENVS.has(env)) return null;
    const end = envEnd(lines, start, env, math);
    if (end < 0) return null;
    const value = lines
      .slice(start, end + 1)
      .join("\n")
      .trim();
    return {
      block: math
        ? { type: "math", fence: "env", value, line: start }
        : { type: "latex", env, value, line: start },
      next: end + 1,
    };
  }

  const fence: "$$" | "\\[" = head.startsWith("$$") ? "$$" : "\\[";
  const close = MATH_CLOSE[fence];
  let body = head.slice(2);
  const inner = body.indexOf(close);
  if (inner >= 0 && inner + close.length < body.length) return null;

  let i = start + 1;
  while (!body.endsWith(close)) {
    const line = lines[i]?.trimEnd();
    if (line === undefined || !line.trim()) return null;
    body += "\n" + line;
    i += 1;
  }
  return {
    block: {
      type: "math",
      fence,
      value: body.slice(0, -close.length).trim(),
      line: start,
    },
    next: i,
  };
}

const DIV_OPEN = /^\s{0,3}(:{3,})\s*(\{[^{}]*\}|[^\s{}:]+)\s*:*\s*$/;
const DIV_CLOSE = /^\s{0,3}:{3,}\s*$/;
const META_EDGE = /^(?:---|\.\.\.)$/;
const META_FIELD = /^([A-Za-z][\w-]*):[ \t]*(.*)$/;
const HEADING_ATTRS = /^([\s\S]*?)\s+(\{\s*(?:[.#-]|[\w-]+=)[^{}]*\})\s*$/;

export function headingClasses(heading: Heading): string[] {
  return heading.attrs ? parseAttrs(heading.attrs).classes : [];
}

function unquote(value: string): string {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2]!.replace(/\\(["'\\])/g, "$1") : value;
}

function metaBlock(
  lines: readonly string[],
): { block: MetaBlock; next: number } | null {
  if (lines[0]?.trim() !== "---") return null;
  const fields: MetaField[] = [];
  let i = 1;
  while (i < lines.length && !META_EDGE.test(lines[i]!.trim())) {
    const m = META_FIELD.exec(lines[i]!);
    if (!m) return null;
    fields.push({ key: m[1]!, value: unquote(m[2]!.trim()) });
    i += 1;
  }
  if (i >= lines.length || !fields.length) return null;
  return {
    block: {
      type: "meta",
      fields,
      raw: lines.slice(0, i + 1).join("\n"),
      line: 0,
    },
    next: i + 1,
  };
}

function divEnd(lines: readonly string[], start: number): number {
  let depth = 0;
  let fence = "";
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (line.trim().startsWith(fence)) fence = "";
      continue;
    }
    if (fence) continue;
    if (DIV_OPEN.test(line)) depth += 1;
    else if (DIV_CLOSE.test(line)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function withoutDivs(src: string): string {
  const lines = src.split("\n");
  const drop = new Set<number>();
  let fence = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (line.trim().startsWith(fence)) fence = "";
      continue;
    }
    if (fence || drop.has(i)) continue;
    const open = DIV_OPEN.exec(line);
    if (!open) continue;
    const end = divEnd(lines, i);
    if (end < 0) continue;
    if (parseAttrs(open[2]!).classes.includes("notes")) {
      for (let j = i; j <= end; j += 1) drop.add(j);
      i = end;
    } else {
      drop.add(i);
      drop.add(end);
    }
  }
  const out: string[] = [];
  let gap = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (drop.has(i)) {
      gap = true;
      continue;
    }
    const blank = !line.trim();
    if (gap && !blank && out.length > 0 && out.at(-1)!.trim()) out.push("");
    if (!(gap && blank && (out.length === 0 || !out.at(-1)!.trim())))
      out.push(line);
    gap = false;
  }
  while (out.length > 0 && !out.at(-1)!.trim() && lines.at(-1)!.trim())
    out.pop();
  return out.join("\n");
}

export function metaValue(
  block: Block | undefined,
  key: string,
): string | undefined {
  if (block?.type !== "meta") return undefined;
  return block.fields.find((field) => field.key === key)?.value;
}

function splitCells(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  if (cells[0]?.trim() === "") cells.shift();
  if (cells.at(-1)?.trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(cell: string): "left" | "right" | "center" | null {
  const s = cell.replace(/\s/g, "");
  if (!/^:?-+:?$/.test(s)) return null;
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function headingContinues(line: string | undefined): boolean {
  if (line === undefined || !line.trim()) return false;
  const text = line.trimEnd();
  return !(
    HEADING_RE.test(text) ||
    RULE_RE.test(text) ||
    BULLET_RE.test(text) ||
    ORDERED_RE.test(text) ||
    QUOTE_RE.test(text) ||
    FENCE_RE.test(text) ||
    MATH_RE.test(text) ||
    DIV_OPEN.test(text)
  );
}

function isDivider(line: string | undefined): boolean {
  if (line === undefined || !line.includes("-")) return false;
  const cells = splitCells(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")))
  );
}

interface Read {
  readonly block: Block;
  readonly next: number;
}

type Reader = (lines: readonly string[], i: number) => Read | null;

function readFence(lines: readonly string[], start: number): Read | null {
  const line = lines[start]!.trimEnd();
  const fence = FENCE_RE.exec(line);
  if (!fence) return null;
  const marker = fence[1]!;
  const indent = line.length - line.trimStart().length;
  const body: string[] = [];
  let i = start + 1;
  while (i < lines.length && !lines[i]!.trim().startsWith(marker)) {
    const text = lines[i]!;
    const lead = text.length - text.trimStart().length;
    body.push(text.slice(Math.min(indent, lead)));
    i += 1;
  }
  return {
    block: {
      type: "codeblock",
      lang: fence[2] ?? "",
      value: body.join("\n"),
      line: start,
    },
    next: i + 1,
  };
}

function readDiv(lines: readonly string[], i: number): Read | null {
  const open = DIV_OPEN.exec(lines[i]!.trimEnd());
  const close = open ? divEnd(lines, i) : -1;
  if (!open || close < 0) return null;
  const attrs = open[2]!;
  return {
    block: {
      type: "div",
      fence: open[1]!,
      attrs,
      ...parseAttrs(attrs),
      children: parseBlocks(lines.slice(i + 1, close).join("\n"), false),
      line: i,
    },
    next: close + 1,
  };
}

function readMath(lines: readonly string[], i: number): Read | null {
  return MATH_RE.test(lines[i]!.trimEnd()) ? displayMath(lines, i) : null;
}

function readTable(lines: readonly string[], start: number): Read | null {
  const line = lines[start]!.trimEnd();
  if (!line.includes("|") || !isDivider(lines[start + 1])) return null;
  const header = splitCells(line);
  const align = splitCells(lines[start + 1]!).map(alignOf);
  const rows: Inline[][][] = [header.map(parseInline)];
  let i = start + 2;
  while (i < lines.length && lines[i]!.includes("|")) {
    rows.push(splitCells(lines[i]!).map(parseInline));
    i += 1;
  }
  return { block: { type: "table", align, rows, line: start }, next: i };
}

function readHeading(lines: readonly string[], start: number): Read | null {
  const head = HEADING_RE.exec(lines[start]!.trimEnd());
  if (!head) return null;
  let i = start;
  let text = head[2]!;
  while (
    (/\\+$/.exec(text)?.[0].length ?? 0) % 2 === 1 &&
    headingContinues(lines[i + 1])
  ) {
    i += 1;
    text = text.slice(0, -1) + HARD + "\n" + lines[i]!.trim();
  }
  const withAttrs = HEADING_ATTRS.exec(text);
  return {
    block: {
      type: "heading",
      depth: head[1]!.length,
      children: inlineOf(withAttrs ? withAttrs[1]! : text, true),
      ...(withAttrs ? { attrs: withAttrs[2]! } : {}),
      line: start,
    },
    next: i + 1,
  };
}

function readPageBreak(lines: readonly string[], i: number): Read | null {
  if (!PAGEBREAK_RE.test(lines[i]!.trimEnd())) return null;
  return { block: { type: "pagebreak", line: i }, next: i + 1 };
}

function readRule(lines: readonly string[], i: number): Read | null {
  if (!RULE_RE.test(lines[i]!.trimEnd())) return null;
  return { block: { type: "rule", line: i }, next: i + 1 };
}

function readQuote(lines: readonly string[], start: number): Read | null {
  if (!QUOTE_RE.test(lines[start]!.trimEnd())) return null;
  const body: string[] = [];
  let i = start;
  while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
    body.push(QUOTE_RE.exec(lines[i]!)![1]!);
    i += 1;
  }
  return {
    block: {
      type: "quote",
      children: parseBlocks(body.join("\n"), false),
      line: start,
    },
    next: i,
  };
}

function readList(lines: readonly string[], start: number): Read | null {
  const line = lines[start]!.trimEnd();
  const bullet = BULLET_RE.exec(line);
  const ordered = ORDERED_RE.exec(line);
  if (!bullet && !ordered) return null;
  const isOrdered = !!ordered;
  const first = Number(ordered?.[2] ?? 1);
  const items: Inline[][] = [];
  const levels: ListLevel[] = [];
  const indents = [(bullet ?? ordered)![1]!.length];
  let i = start;
  while (i < lines.length) {
    const b = BULLET_RE.exec(lines[i]!);
    const o = ORDERED_RE.exec(lines[i]!);
    const hit = b ?? o;
    if (!hit) break;
    const indent = hit[1]!.length;
    while (indents.length > 1 && indent < indents.at(-1)!) indents.pop();
    if (indent > indents.at(-1)!) indents.push(indent);
    const depth = indents.length - 1;
    if (depth === 0 && !!o !== isOrdered) break;
    items.push(parseInline(hit[3]!));
    levels.push({ depth, ordered: !!o, start: Number(o?.[2] ?? 1) });
    i += 1;
  }
  return {
    block: {
      type: "list",
      ordered: isOrdered,
      start: first,
      items,
      ...(levels.some((l) => l.depth > 0) ? { levels } : {}),
      line: start,
    },
    next: i,
  };
}

function endsParagraph(
  lines: readonly string[],
  i: number,
  start: number,
): boolean {
  const line = lines[i]!.trimEnd();
  return (
    !line.trim() ||
    HEADING_RE.test(line) ||
    RULE_RE.test(line) ||
    BULLET_RE.test(line) ||
    ORDERED_RE.test(line) ||
    QUOTE_RE.test(line) ||
    FENCE_RE.test(line) ||
    (i > start && MATH_RE.test(line) && displayMath(lines, i) !== null) ||
    (DIV_OPEN.test(line) && divEnd(lines, i) >= 0)
  );
}

function paragraphLine(raw: string, last: boolean): string {
  const text = raw.trim();
  if (last) return text;
  if (/ {2,}$/.test(raw)) return text + HARD;
  const slashes = /\\+$/.exec(text)?.[0].length ?? 0;
  return slashes % 2 === 1 ? text.slice(0, -1) + HARD : text;
}

function readParagraph(lines: readonly string[], start: number): Read | null {
  let i = start;
  while (i < lines.length && !endsParagraph(lines, i, start)) i += 1;
  if (i === start) return null;
  const buf = lines.slice(start, i);
  const text = buf
    .map((raw, index) => paragraphLine(raw, index === buf.length - 1))
    .join("\n");
  return {
    block: { type: "paragraph", children: parseInline(text), line: start },
    next: i,
  };
}

const READERS: readonly Reader[] = [
  readFence,
  readDiv,
  readMath,
  readTable,
  readHeading,
  readPageBreak,
  readRule,
  readQuote,
  readList,
  readParagraph,
];

function readBlock(lines: readonly string[], i: number): Read | null {
  for (const reader of READERS) {
    const read = reader(lines, i);
    if (read) return read;
  }
  return null;
}

export function parse(src: string): Block[] {
  return parseBlocks(src, true);
}

function parseBlocks(src: string, top: boolean): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  const meta = top ? metaBlock(lines) : null;
  if (meta) {
    out.push(meta.block);
    i = meta.next;
  }

  while (i < lines.length) {
    if (!lines[i]!.trim()) {
      i += 1;
      continue;
    }
    const read = readBlock(lines, i);
    if (read) {
      out.push(read.block);
      i = read.next;
    } else i += 1;
  }

  return out;
}
