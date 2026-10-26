import type { Block, Heading, MetaBlock, MetaField } from "./ast.ts";
import { parseAttrs } from "./attrs.ts";
import { FENCE_RE, closesFence } from "./fences.ts";

export const DIV_OPEN = /^\s{0,3}(:{3,})\s*(\{[^{}]*\}|[^\s{}:]+)\s*:*\s*$/;
const DIV_CLOSE = /^\s{0,3}:{3,}\s*$/;
const META_EDGE = /^(?:---|\.\.\.)$/;
const META_FIELD = /^([A-Za-z][\w-]*):[ \t]*(.*)$/;

export function headingClasses(heading: Heading): string[] {
  return heading.attrs ? parseAttrs(heading.attrs).classes : [];
}

function unquote(value: string): string {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2]!.replace(/\\(["'\\])/g, "$1") : value;
}

export function metaBlock(
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

export function divEnd(lines: readonly string[], start: number): number {
  let depth = 0;
  let fence = "";
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (closesFence(line, fence)) fence = "";
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

function divLines(lines: readonly string[]): Set<number> {
  const drop = new Set<number>();
  let fence = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const code = FENCE_RE.exec(line);
    if (code) {
      if (!fence) fence = code[1]!;
      else if (closesFence(line, fence)) fence = "";
      continue;
    }
    if (fence || drop.has(i)) continue;
    const open = DIV_OPEN.exec(line);
    const end = open ? divEnd(lines, i) : -1;
    if (end < 0) continue;
    if (parseAttrs(open![2]!).classes.includes("notes")) {
      for (let j = i; j <= end; j += 1) drop.add(j);
      i = end;
    } else {
      drop.add(i);
      drop.add(end);
    }
  }
  return drop;
}

const blankLine = (line: string | undefined): boolean => !line?.trim();

function keptLines(lines: readonly string[], drop: Set<number>): string[] {
  const out: string[] = [];
  let gap = false;
  lines.forEach((line, i) => {
    if (drop.has(i)) {
      gap = true;
      return;
    }
    const blank = !line.trim();
    const lastBlank = blankLine(out.at(-1));
    if (gap && !blank && !lastBlank) out.push("");
    if (!(gap && blank && lastBlank)) out.push(line);
    gap = false;
  });
  return out;
}

export function withoutDivs(src: string): string {
  const lines = src.split("\n");
  const out = keptLines(lines, divLines(lines));
  while (out.length > 0 && blankLine(out.at(-1)) && !blankLine(lines.at(-1)))
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
