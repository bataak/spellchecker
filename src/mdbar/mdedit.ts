import { replaceRange } from "../editor/editortext.ts";
import { minimalDiff } from "../core/textdiff.ts";
import { lineEndAt, lineStartAt } from "../core/text.ts";
import { fencedCode, inRanges, linkRanges } from "../spell/codeskip.ts";
import { DIVIDER, inTable, inFence, inMath, unquote } from "./mdcontext.ts";

export interface Edit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const HEADING = /^(#{1,6})[ \t]+/;

const BULLET = /^([-*+])[ \t]+/;

const ORDERED = /^(\d+)[.)][ \t]+/;

const INDENT = /^[ \t]*/;

const ANY_BULLET = /^\s*[-*+]\s+/;

const ANY_ORDERED = /^\s*\d+[.)]\s+/;

const ANY_QUOTE = /^\s*>/;

const QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ \t]?)*/;

interface Bounds {
  readonly from: number;
  readonly to: number;
  readonly lines: string[];
}

function boundsOf(text: string, from: number, to: number): Bounds {
  return { from, to, lines: text.slice(from, to).split("\n") };
}

function blockLines(text: string, start: number, end: number): Bounds {
  const e = end > start && text[end - 1] === "\n" ? end - 1 : end;
  return boundsOf(text, lineStartAt(text, start), lineEndAt(text, e));
}

function tableRow(text: string, from: number): boolean {
  const to = lineEndAt(text, from);
  return inTable(text, from, to, text.slice(from, to));
}

function blockRows(text: string): (from: number) => boolean {
  const code = fencedCode(text);
  return (from) => inRanges(code, from) || tableRow(text, from);
}

function lineStarts(bounds: Bounds): number[] {
  const out: number[] = [];
  let pos = bounds.from;
  for (const line of bounds.lines) {
    out.push(pos);
    pos += line.length + 1;
  }
  return out;
}

function wholeBlocks(text: string, bounds: Bounds): Bounds {
  const code = fencedCode(text);
  let { from, to } = bounds;
  const block = code.find((r) => from >= r.start && from < r.end);
  if (block) from = block.start;
  else if (tableRow(text, from))
    while (from > 0 && tableRow(text, lineStartAt(text, from - 1)))
      from = lineStartAt(text, from - 1);
  const last = lineStartAt(text, to);
  const tail = code.find((r) => last >= r.start && last < r.end);
  if (tail) to = tail.end;
  else if (tableRow(text, last))
    while (to < text.length && tableRow(text, to + 1))
      to = lineEndAt(text, to + 1);
  return boundsOf(text, from, to);
}

interface PrefixSpec {
  readonly drop: number;
  readonly add: string;
}

function mapPrefix(
  text: string,
  start: number,
  end: number,
  fn: (line: string, index: number) => PrefixSpec | null,
  bounds: Bounds = blockLines(text, start, end),
): Edit {
  const { from, to, lines } = bounds;
  const out: string[] = [];

  let pos = from;
  let acc = 0;
  let newStart = start;
  let newEnd = end;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const spec = fn(line, i);
    const drop = spec?.drop ?? 0;
    const add = spec?.add ?? "";
    out.push(spec ? add + line.slice(drop) : line);
    const delta = spec ? add.length - drop : 0;

    const ls = pos;
    const le = pos + line.length;
    const fix = (p: number, anchor: boolean): number => {
      const off = p - ls;
      if (off === 0 && anchor) return ls + acc;
      return ls + acc + (off < drop ? add.length : off + delta);
    };
    if (start >= ls && start <= le) newStart = fix(start, start !== end);
    if (end >= ls && end <= le) newEnd = fix(end, false);

    acc += delta;
    pos = le + 1;
  }

  if (end > to) newEnd = end + acc;

  return {
    text: text.slice(0, from) + out.join("\n") + text.slice(to),
    start: newStart,
    end: Math.max(newStart, newEnd),
  };
}

function runBefore(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos - n - 1 >= 0 && text[pos - n - 1] === ch) n += 1;
  return n;
}

function runAfter(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos + n < text.length && text[pos + n] === ch) n += 1;
  return n;
}

function wrapped(run: number, marker: string): boolean {
  if (marker[0] !== "*") return run >= marker.length;
  return marker.length === 2 ? run >= 2 : run % 2 === 1;
}

const LINE_PREFIX =
  /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/;

function trimSpan(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;
  return [s, e];
}

function markerPattern(marker: string): RegExp {
  if (marker === "*") return /(?<!\*)\*(?!\*)/g;
  return new RegExp(marker.replace(/[*`]/g, "\\$&"), "g");
}

function pairedInside(content: string, marker: string): boolean {
  const n = content.match(markerPattern(marker))?.length ?? 0;
  return n > 0 && n % 2 === 0;
}

function spanWrapped(
  text: string,
  s: number,
  e: number,
  marker: string,
): boolean {
  const ch = marker[0]!;
  return (
    wrapped(Math.min(runBefore(text, s, ch), runAfter(text, e, ch)), marker) &&
    !pairedInside(text.slice(s, e), marker)
  );
}

function lineSpans(
  text: string,
  from: number,
  span: readonly [number, number],
  marker: string,
): [number, number][] {
  const to = lineEndAt(text, from);
  const line = text.slice(from, to);
  const out: [number, number][] = [];
  const add = (x: number, y: number): void => {
    let [a, b] = trimSpan(text, Math.max(x, span[0]), Math.min(y, span[1]));
    const edges = text[a] === marker[0] && text[b - 1] === marker[0];
    if (marker !== "`" || edges) {
      while (a < b && text[a] === marker[0]) a += 1;
      while (b > a && text[b - 1] === marker[0]) b -= 1;
    }
    if (a < b) out.push([a, b]);
  };
  if (!inTable(text, from, to, line)) {
    add(from + LINE_PREFIX.exec(line)![0].length, to);
    return out;
  }
  const bare = unquote(line);
  if (DIVIDER.test(bare)) return out;
  let cell = to - bare.length;
  for (let i = cell; i <= to; i += 1) {
    if (i < to && (text[i] !== "|" || text[i - 1] === "\\")) continue;
    add(cell, i);
    cell = i + 1;
  }
  return out;
}

function toggleWrapLines(
  text: string,
  s: number,
  e: number,
  marker: string,
): Edit {
  const spans: [number, number][] = [];
  for (let from = lineStartAt(text, s); from <= e;) {
    spans.push(...lineSpans(text, from, [s, e], marker));
    from = lineEndAt(text, from) + 1;
  }
  if (!spans.length) return { text, start: s, end: e };
  const all = spans.every(([a, b]) => spanWrapped(text, a, b, marker));
  let out = text;
  let first = spans[0]![0];
  let last = spans.at(-1)![1];
  let lastLength = text.length;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const [a, b] = spans[i]!;
    if (!all && spanWrapped(out, a, b, marker)) continue;
    const edit = toggleWrap(out, a, b, marker);
    out = edit.text;
    first = edit.start;
    if (i === spans.length - 1) {
      last = edit.end;
      lastLength = out.length;
    }
  }
  return { text: out, start: first, end: last + out.length - lastLength };
}

export function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): Edit {
  const m = marker.length;
  const ch = marker[0]!;

  const [s, e] = trimSpan(text, start, end);
  const picked = text.slice(s, e);
  if (
    picked.includes("\n") ||
    (picked.includes("|") && tableRow(text, lineStartAt(text, s)))
  )
    return toggleWrapLines(text, s, e, marker);

  if (s === e) {
    const run = Math.min(runBefore(text, start, ch), runAfter(text, start, ch));
    if (wrapped(run, marker)) {
      const at = start - m;
      return {
        text: text.slice(0, at) + text.slice(start + m),
        start: at,
        end: at,
      };
    }
    const at = start + m;
    return {
      text: text.slice(0, start) + marker + marker + text.slice(start),
      start: at,
      end: at,
    };
  }

  if (marker === "`" && picked.includes("`")) return toggleCode(text, s, e);

  const inside = text.slice(s, e);
  const paired = pairedInside(inside, marker);
  const outer = Math.min(runBefore(text, s, ch), runAfter(text, e, ch));
  if (wrapped(outer, marker) && !paired) {
    return {
      text: text.slice(0, s - m) + text.slice(s, e) + text.slice(e + m),
      start: s - m,
      end: e - m,
    };
  }

  const inner = Math.min(runAfter(text, s, ch), runBefore(text, e, ch));
  if (
    e - s >= 2 * m &&
    inner > 0 &&
    wrapped(inner, marker) &&
    !pairedInside(text.slice(s + m, e - m), marker)
  ) {
    return {
      text: text.slice(0, s) + text.slice(s + m, e - m) + text.slice(e),
      start: s,
      end: e - 2 * m,
    };
  }

  if (paired) {
    const plain = inside.replace(markerPattern(marker), "");
    if (wrapped(outer, marker))
      return {
        text: text.slice(0, s) + plain + text.slice(e),
        start: s,
        end: s + plain.length,
      };
    return {
      text: text.slice(0, s) + marker + plain + marker + text.slice(e),
      start: s + m,
      end: s + m + plain.length,
    };
  }

  return {
    text: text.slice(0, s) + marker + text.slice(s, e) + marker + text.slice(e),
    start: s + m,
    end: e + m,
  };
}

function hasRun(text: string, n: number): boolean {
  return (text.match(/`+/g) ?? []).some((run) => run.length === n);
}

function toggleCode(text: string, s: number, e: number): Edit {
  const inside = text.slice(s, e);
  const open = /^`*/.exec(inside)![0].length;
  const close = /`*$/.exec(inside)![0].length;
  if (open > 0 && open === close && open * 2 < inside.length) {
    let body = inside.slice(open, -close);
    if (!hasRun(body, open)) {
      if (/^ .*\S.* $/s.test(body)) body = body.slice(1, -1);
      return {
        text: text.slice(0, s) + body + text.slice(e),
        start: s,
        end: s + body.length,
      };
    }
  }
  const pad = text[s - 1] === " " && text[e] === " " ? 1 : 0;
  const left = runBefore(text, s - pad, "`");
  if (
    left > 0 &&
    left === runAfter(text, e + pad, "`") &&
    !hasRun(inside, left)
  )
    return {
      text: text.slice(0, s - pad - left) + inside + text.slice(e + pad + left),
      start: s - pad - left,
      end: e - pad - left,
    };
  const longest = Math.max(
    ...(inside.match(/`+/g) ?? [""]).map((r) => r.length),
  );
  const fence = "`".repeat(longest + 1);
  const at = s + fence.length + 1;
  return {
    text: text.slice(0, s) + fence + " " + inside + " " + fence + text.slice(e),
    start: at,
    end: at + inside.length,
  };
}

export function headingDepthAt(text: string, pos: number): number {
  const from = lineStartAt(text, pos);
  const line = text.slice(from, lineEndAt(text, pos));
  const body = line.slice(QUOTE_PREFIX.exec(line)![0].length);
  return HEADING.exec(body)?.[1]?.length ?? 0;
}

export function toggleHeading(
  text: string,
  start: number,
  end: number,
  depth: 1 | 2 | 3 | 4 | 5 | 6,
): Edit {
  const bounds = blockLines(text, start, end);
  const starts = lineStarts(bounds);
  const isBlock = blockRows(text);
  const quote = (line: string): string => QUOTE_PREFIX.exec(line)![0];
  const bodies = bounds.lines.map((l, i) =>
    isBlock(starts[i]!) ? "" : l.slice(quote(l).length),
  );
  const filled = bodies.filter((l) => l.trim());
  const already =
    filled.length > 0 &&
    filled.every((l) => (HEADING.exec(l)?.[1]?.length ?? 0) === depth);
  const target = already ? 0 : depth;

  return mapPrefix(
    text,
    start,
    end,
    (line, index) => {
      const body = bodies[index]!;
      if (!body.trim()) return null;
      const lead = quote(line);
      const head = HEADING.exec(body);
      const list = head ? null : (BULLET.exec(body) ?? ORDERED.exec(body));
      const drop = (head ?? list)?.[0].length ?? 0;
      const add = target ? "#".repeat(target) + " " : "";
      if (drop === 0 && add === "") return null;
      return { drop: lead.length + drop, add: lead + add };
    },
    bounds,
  );
}

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

const TITLE_START = /(^|[\s\-–—(«"„/])(\p{L})/gu;

type CaseForm = "upper" | "title" | "lower";

function caseForm(part: string, form: CaseForm): string {
  if (form === "upper") return part.toLocaleUpperCase("mn");
  const lower = part.toLocaleLowerCase("mn");
  if (form === "lower") return lower;
  return lower.replace(
    TITLE_START,
    (_, lead: string, letter: string) => lead + letter.toLocaleUpperCase("mn"),
  );
}

function plainPieces(text: string, s: number, e: number): [number, number][] {
  const out: [number, number][] = [];
  let at = s;
  for (const link of linkRanges(text)) {
    if (link.end <= at || link.start >= e) continue;
    if (link.start > at) out.push([at, link.start]);
    at = link.end;
  }
  if (at < e) out.push([at, e]);
  return out;
}

export function cycleCase(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  if (s === e) {
    while (s > 0 && WORD_CHAR.test(text[s - 1]!)) s -= 1;
    while (e < text.length && WORD_CHAR.test(text[e]!)) e += 1;
  }
  const pieces = plainPieces(text, s, e);
  const part = pieces.map(([a, b]) => text.slice(a, b)).join("");
  const upper = caseForm(part, "upper");
  const lower = caseForm(part, "lower");
  const title = caseForm(part, "title");
  const form: CaseForm =
    part === lower && part !== upper
      ? "upper"
      : part === upper && part !== lower && title !== part
        ? "title"
        : "lower";
  let out = text.slice(0, e);
  for (const [a, b] of [...pieces].reverse())
    out = out.slice(0, a) + caseForm(text.slice(a, b), form) + out.slice(b);
  return { text: out + text.slice(e), start: s, end: out.length };
}

interface ListOwner {
  readonly indent: number;
  readonly width: number;
  shift: number;
}

export function toggleList(
  text: string,
  start: number,
  end: number,
  ordered: boolean,
): Edit {
  const bounds = blockLines(text, start, end);
  const starts = lineStarts(bounds);
  const isBlock = blockRows(text);
  const kind = ordered ? ORDERED : BULLET;
  const rows = bounds.lines.map((line, i) => {
    const lead = QUOTE_PREFIX.exec(line)![0];
    const body = line.slice(lead.length);
    const indent = INDENT.exec(body)![0];
    const rest = body.slice(indent.length);
    const marker = BULLET.exec(rest) ?? ORDERED.exec(rest);
    return { lead, body, indent, rest, marker, skip: isBlock(starts[i]!) };
  });

  const heads: (ListOwner | null)[] = [];
  const owners: (ListOwner | null)[] = [];
  let owner: ListOwner | null = null;
  for (const row of rows) {
    const mine: ListOwner | null =
      row.marker && !row.skip
        ? { indent: row.indent.length, width: row.marker[0].length, shift: 0 }
        : null;
    heads.push(mine);
    if (mine) owner = mine;
    else if (
      !row.skip &&
      row.body.trim() &&
      owner &&
      row.indent.length < owner.indent + owner.width
    )
      owner = null;
    owners.push(!mine && !row.skip && row.body.trim() ? owner : null);
  }
  const items = rows.filter((r, i) => !r.skip && r.body.trim() && !owners[i]);
  const off = items.length > 0 && items.every((r) => kind.test(r.rest));

  const counts = new Map<number, number>();
  return mapPrefix(
    text,
    start,
    end,
    (_line, i) => {
      const row = rows[i]!;
      if (row.skip || !row.body.trim()) return null;
      const { lead, indent, rest } = row;
      const cont = owners[i];
      if (cont) {
        const shift = off ? -cont.width : cont.shift;
        if (shift === 0) return null;
        if (shift > 0)
          return { drop: lead.length, add: lead + " ".repeat(shift) };
        return {
          drop: lead.length + Math.min(-shift, indent.length),
          add: lead,
        };
      }
      const head = HEADING.exec(rest);
      const tail = rest.slice(head?.[0].length ?? 0);
      const marker = BULLET.exec(tail) ?? ORDERED.exec(tail);
      const drop =
        lead.length +
        indent.length +
        (head?.[0].length ?? 0) +
        (marker?.[0].length ?? 0);
      if (off) return { drop, add: lead + indent };
      for (const depth of counts.keys())
        if (depth > indent.length) counts.delete(depth);
      const n = (counts.get(indent.length) ?? 0) + 1;
      counts.set(indent.length, n);
      const add = ordered ? `${String(n)}. ` : "- ";
      const mine = heads[i];
      if (mine) mine.shift = add.length - mine.width;
      return { drop, add: lead + indent + add };
    },
    bounds,
  );
}

export function enterInsert(text: string, caret: number): "\n" | "\n\n" {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  const line = text.slice(from, to);

  if (!line.trim()) return "\n";
  if (ANY_BULLET.test(line) || ANY_ORDERED.test(line)) return "\n";
  if (ANY_QUOTE.test(line)) return "\n";
  if (inTable(text, from, to, line)) return "\n";
  if (inFence(text, caret)) return "\n";
  if (inMath(text, caret)) return "\n";

  return "\n\n";
}

export function toggleQuote(text: string, start: number, end: number): Edit {
  const bounds = wholeBlocks(text, blockLines(text, start, end));
  const filled = bounds.lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => ANY_QUOTE.test(l));

  return mapPrefix(
    text,
    start,
    end,
    (line) => {
      if (!line.trim()) return null;
      const marker = /^\s*>[ \t]?/.exec(line);
      if (off) return marker ? { drop: marker[0].length, add: "" } : null;
      return marker ? null : { drop: 0, add: "> " };
    },
    bounds,
  );
}

export function applyEdit(
  editor: HTMLTextAreaElement,
  edit: Edit,
  options: FocusOptions = {},
): void {
  const patch = minimalDiff(editor.value, edit.text);

  if (patch) {
    editor.focus(options);
    if (!replaceRange(editor, patch.from, patch.to, patch.insert))
      editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  editor.setSelectionRange(edit.start, edit.end);
}
