import { type Block, type Inline, type ListLevel } from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { HARD, inlineOf, parseInline } from "./inline.ts";
import { FENCE_RE, closesFence } from "./fences.ts";
import { MATH_RE, displayMath } from "./mathblock.ts";
import { DIV_OPEN, divEnd, metaBlock } from "./divs.ts";

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
export const RULE_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const PAGEBREAK_RE = /^\s*\\newpage\s*$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/s;
const HEADING_ATTRS = /^([\s\S]*?)\s+(\{\s*(?:[.#-]|[\w-]+=)[^{}]*\})\s*$/;

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
  while (i < lines.length && !closesFence(lines[i]!, marker)) {
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
  const dividers = splitCells(lines[start + 1]!);
  const align = dividers.map(alignOf);
  const rule = dividers.map((cell) => cell.replace(/[^-]/g, "").length);
  const rows: Inline[][][] = [header.map(parseInline)];
  let i = start + 2;
  while (i < lines.length && lines[i]!.includes("|")) {
    rows.push(splitCells(lines[i]!).map(parseInline));
    i += 1;
  }
  return { block: { type: "table", align, rows, rule, line: start }, next: i };
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
      i = Math.max(read.next, i + 1);
    } else i += 1;
  }

  return out;
}
