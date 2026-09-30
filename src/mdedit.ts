import { codeRanges, inRanges } from "./codeskip.ts";

export interface Edit {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const HEADING = /^(#{1,6})[ \t]+/;
const BULLET = /^([-*+])[ \t]+/;
const ORDERED = /^(\d+)[.)][ \t]+/;

const ANY_BULLET = /^\s*[-*+]\s+/;
const ANY_ORDERED = /^\s*\d+[.)]\s+/;
const ANY_QUOTE = /^\s*>/;
const DIVIDER = /^[\s|:-]*-[\s|:-]*$/;

function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

function lineEndAt(text: string, pos: number): number {
  const i = text.indexOf("\n", pos);
  return i < 0 ? text.length : i;
}

interface Bounds {
  readonly from: number;
  readonly to: number;
  readonly lines: string[];
}

function blockLines(text: string, start: number, end: number): Bounds {
  const e = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const from = lineStartAt(text, start);
  const to = lineEndAt(text, e);
  return { from, to, lines: text.slice(from, to).split("\n") };
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
): Edit {
  const { from, to, lines } = blockLines(text, start, end);
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

export function toggleWrap(
  text: string,
  start: number,
  end: number,
  marker: string,
): Edit {
  const m = marker.length;
  const ch = marker[0]!;

  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

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

  const outer = Math.min(runBefore(text, s, ch), runAfter(text, e, ch));
  if (wrapped(outer, marker)) {
    return {
      text: text.slice(0, s - m) + text.slice(s, e) + text.slice(e + m),
      start: s - m,
      end: e - m,
    };
  }

  const inner = Math.min(runAfter(text, s, ch), runBefore(text, e, ch));
  if (e - s >= 2 * m && inner > 0 && wrapped(inner, marker)) {
    return {
      text: text.slice(0, s) + text.slice(s + m, e - m) + text.slice(e),
      start: s,
      end: e - 2 * m,
    };
  }

  return {
    text: text.slice(0, s) + marker + text.slice(s, e) + marker + text.slice(e),
    start: s + m,
    end: e + m,
  };
}

export function headingDepthAt(text: string, pos: number): number {
  const from = lineStartAt(text, pos);
  const line = text.slice(from, lineEndAt(text, pos));
  return HEADING.exec(line)?.[1]?.length ?? 0;
}

export function toggleHeading(
  text: string,
  start: number,
  end: number,
  depth: 1 | 2 | 3 | 4 | 5 | 6,
): Edit {
  const { lines } = blockLines(text, start, end);
  const filled = lines.filter((l) => l.trim());
  const already =
    filled.length > 0 &&
    filled.every((l) => (HEADING.exec(l)?.[1]?.length ?? 0) === depth);
  const target = already ? 0 : depth;

  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const head = HEADING.exec(line);
    const list = head ? null : (BULLET.exec(line) ?? ORDERED.exec(line));
    const drop = (head ?? list)?.[0].length ?? 0;
    const add = target ? "#".repeat(target) + " " : "";
    if (drop === 0 && add === "") return null;
    return { drop, add };
  });
}

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

const TITLE_START = /(^|[\s\-–—(«"„/])(\p{L})/gu;

export function cycleCase(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  if (s === e) {
    while (s > 0 && WORD_CHAR.test(text[s - 1]!)) s -= 1;
    while (e < text.length && WORD_CHAR.test(text[e]!)) e += 1;
  }
  const part = text.slice(s, e);
  const upper = part.toLocaleUpperCase("mn");
  const lower = part.toLocaleLowerCase("mn");
  const title = lower.replace(
    TITLE_START,
    (_, lead: string, letter: string) => lead + letter.toLocaleUpperCase("mn"),
  );
  const next =
    part === lower && part !== upper
      ? upper
      : part === upper && part !== lower
        ? title
        : lower;
  return {
    text: text.slice(0, s) + next + text.slice(e),
    start: s,
    end: s + next.length,
  };
}

export function toggleList(
  text: string,
  start: number,
  end: number,
  ordered: boolean,
): Edit {
  const { lines } = blockLines(text, start, end);
  const kind = ordered ? ORDERED : BULLET;
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => kind.test(l));

  let n = 0;
  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const head = HEADING.exec(line);
    const rest = line.slice(head?.[0].length ?? 0);
    const marker = BULLET.exec(rest) ?? ORDERED.exec(rest);
    const drop = (head?.[0].length ?? 0) + (marker?.[0].length ?? 0);
    if (off) {
      if (drop === 0) return null;
      return { drop, add: "" };
    }
    n += 1;
    return { drop, add: ordered ? `${String(n)}. ` : "- " };
  });
}

function lineAt(text: string, index: number): string {
  if (index < 0 || index > text.length) return "";
  return text.slice(lineStartAt(text, index), lineEndAt(text, index));
}

function inTable(
  text: string,
  from: number,
  to: number,
  line: string,
): boolean {
  if (!line.includes("|")) return false;
  if (/^\s*\|/.test(line)) return true;
  const prev = from > 0 ? lineAt(text, from - 1) : "";
  const next = to < text.length ? lineAt(text, to + 1) : "";
  return (
    (prev.includes("|") && DIVIDER.test(prev)) ||
    (next.includes("|") && DIVIDER.test(next))
  );
}

function inFence(text: string, caret: number): boolean {
  if (!text.includes("```") && !text.includes("~~~")) return false;
  return inRanges(codeRanges(text), caret);
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

  return "\n\n";
}

export interface Patch {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export function minimalDiff(before: string, after: string): Patch | null {
  if (before === after) return null;

  const max = Math.min(before.length, after.length);
  let a = 0;
  while (a < max && before.charCodeAt(a) === after.charCodeAt(a)) a += 1;

  let b = 0;
  while (
    b < max - a &&
    before.charCodeAt(before.length - 1 - b) ===
      after.charCodeAt(after.length - 1 - b)
  )
    b += 1;

  return {
    from: a,
    to: before.length - b,
    insert: after.slice(a, after.length - b),
  };
}

export function toggleQuote(text: string, start: number, end: number): Edit {
  const { lines } = blockLines(text, start, end);
  const filled = lines.filter((l) => l.trim());
  const off = filled.length > 0 && filled.every((l) => ANY_QUOTE.test(l));

  return mapPrefix(text, start, end, (line) => {
    if (!line.trim()) return null;
    const marker = /^\s*>[ \t]?/.exec(line);
    if (off) return marker ? { drop: marker[0].length, add: "" } : null;
    return marker ? null : { drop: 0, add: "> " };
  });
}

const URLISH = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)\S*$/i;

export function wrapLink(text: string, start: number, end: number): Edit {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;

  const picked = text.slice(s, e);

  if (!picked) {
    const inserted = "[]()";
    return {
      text: text.slice(0, start) + inserted + text.slice(start),
      start: start + 1,
      end: start + 1,
    };
  }

  if (URLISH.test(picked)) {
    const inserted = "[](" + picked + ")";
    return {
      text: text.slice(0, s) + inserted + text.slice(e),
      start: s + 1,
      end: s + 1,
    };
  }

  const inserted = "[" + picked + "]()";
  const at = s + picked.length + 3;
  return {
    text: text.slice(0, s) + inserted + text.slice(e),
    start: at,
    end: at,
  };
}

export function insertTable(
  text: string,
  caret: number,
  cols = 2,
  rows = 1,
): Edit {
  const to = lineEndAt(text, caret);
  const line = text.slice(lineStartAt(text, caret), to);

  const names = Array.from(
    { length: cols },
    (_, i) => "Багана " + String(i + 1),
  );
  const head = "| " + names.join(" | ") + " |";
  const divider =
    "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const blank =
    "| " + Array.from({ length: cols }, () => "   ").join(" | ") + " |";
  const body = Array.from({ length: rows }, () => blank).join("\n");

  const before = line.trim() ? "\n\n" : "";
  const after = to < text.length ? "\n" : "";
  const block = head + "\n" + divider + "\n" + body;

  const at = to + before.length + 2;
  return {
    text: text.slice(0, to) + before + block + after + text.slice(to),
    start: at,
    end: at + names[0]!.length,
  };
}

export type AlignKind = "left" | "center" | "right" | "signature";

const FENCE_OPEN = /^\s{0,3}(:{3,})\s*(\{[^{}]*\}|[^\s{}:]+)\s*:*\s*$/;
const FENCE_CLOSE = /^\s{0,3}:{3,}\s*$/;
const ALIGN_OPEN =
  /^\s{0,3}(:{3,})\s*(?:\{\s*\.(left|center|right|signature)\s*\}|(left|center|right|signature))\s*:*\s*$/;

interface AlignDiv {
  readonly kind: AlignKind;
  readonly fence: string;
  readonly open: number;
  readonly close: number;
}

function rowAt(text: string, pos: number): number {
  let row = 0;
  for (
    let i = text.indexOf("\n");
    i >= 0 && i < pos;
    i = text.indexOf("\n", i + 1)
  )
    row += 1;
  return row;
}

function enclosingAlign(
  lines: readonly string[],
  first: number,
  last: number,
): AlignDiv | null {
  let depth = 0;
  let open = -1;
  for (let i = first; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (FENCE_CLOSE.test(line)) {
      if (i !== first) depth += 1;
    } else if (FENCE_OPEN.test(line)) {
      if (depth === 0) {
        open = i;
        break;
      }
      depth -= 1;
    }
  }
  const match = open < 0 ? null : ALIGN_OPEN.exec(lines[open]!);
  if (match === null) return null;
  depth = 0;
  for (let i = Math.max(last, open + 1); i < lines.length; i += 1) {
    const line = lines[i]!;
    if (FENCE_OPEN.test(line)) depth += 1;
    else if (FENCE_CLOSE.test(line)) {
      if (depth === 0)
        return {
          kind: (match[2] ?? match[3]) as AlignKind,
          fence: match[1]!,
          open,
          close: i,
        };
      depth -= 1;
    }
  }
  return null;
}

export function alignAt(text: string, pos: number): AlignKind | null {
  const row = rowAt(text, pos);
  return enclosingAlign(text.split("\n"), row, row)?.kind ?? null;
}

interface Change {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
  readonly push?: boolean;
}

function applyChanges(
  text: string,
  start: number,
  end: number,
  changes: readonly Change[],
): Edit {
  let out = text;
  let s = start;
  let e = end;
  const move = (pos: number, c: Change): number =>
    pos > c.to || (pos === c.to && (c.from < c.to || c.push === true))
      ? pos + c.insert.length - (c.to - c.from)
      : pos > c.from
        ? c.from
        : pos;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    s = move(s, c);
    e = move(e, c);
  }
  return { text: out, start: s, end: e };
}

export function toggleAlign(
  text: string,
  start: number,
  end: number,
  kind: AlignKind,
): Edit {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }
  const lineEnd = (row: number): number => offsets[row]! + lines[row]!.length;
  const first = rowAt(text, start);
  const last = rowAt(
    text,
    end > start && text[end - 1] === "\n" ? end - 1 : end,
  );

  const found = enclosingAlign(lines, first, last);
  if (found !== null) {
    if (found.kind !== kind)
      return applyChanges(text, start, end, [
        {
          from: offsets[found.open]!,
          to: lineEnd(found.open),
          insert: found.fence + " {." + kind + "}",
        },
      ]);
    if (found.close === found.open + 1)
      return applyChanges(text, start, end, [
        {
          from: offsets[found.open]!,
          to:
            found.close === lines.length - 1
              ? lineEnd(found.close)
              : offsets[found.close + 1]!,
          insert: "",
        },
      ]);
    const closer =
      found.close === lines.length - 1
        ? { from: lineEnd(found.close - 1), to: lineEnd(found.close) }
        : { from: offsets[found.close]!, to: offsets[found.close + 1]! };
    return applyChanges(text, start, end, [
      { from: offsets[found.open]!, to: offsets[found.open + 1]!, insert: "" },
      { ...closer, insert: "" },
    ]);
  }

  const edge = (line: string): boolean =>
    !line.trim() || FENCE_OPEN.test(line) || FENCE_CLOSE.test(line);
  let top = first;
  let bottom = last;
  if (!edge(lines[top]!)) while (top > 0 && !edge(lines[top - 1]!)) top -= 1;
  if (!edge(lines[bottom]!))
    while (bottom < lines.length - 1 && !edge(lines[bottom + 1]!)) bottom += 1;
  return applyChanges(text, start, end, [
    {
      from: offsets[top]!,
      to: offsets[top]!,
      insert: "::: {." + kind + "}\n",
      push: true,
    },
    { from: lineEnd(bottom), to: lineEnd(bottom), insert: "\n:::" },
  ]);
}

const NAME_HOLDER = "Овог Нэр";

function signatureTable(date: Date): string {
  const day =
    String(date.getFullYear()) +
    "/" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(date.getDate()).padStart(2, "0");
  const rows: [string, string][] = [
    ["Өргөдөл гаргасан:", NAME_HOLDER],
    ["Гарын үсэг:", "____"],
    ["Утас:", "____"],
    ["", day],
  ];
  const a = Math.max(...rows.map(([label]) => label.length));
  const b = Math.max(...rows.map(([, value]) => value.length));
  const row = (x: string, y: string): string => "| " + x + " | " + y + " |";
  return [
    row(" ".repeat(a), " ".repeat(b)),
    row("-".repeat(a - 1) + ":", ":" + "-".repeat(b - 1)),
    ...rows.map(([label, value]) => row(label.padStart(a), value.padEnd(b))),
  ].join("\n");
}

export function insertSignature(
  text: string,
  caret: number,
  date: Date,
): Edit | null {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  if (text.slice(from, to).trim()) return null;
  const row = rowAt(text, caret);
  if (enclosingAlign(text.split("\n"), row, row) !== null) return null;
  const before = from > 0 && lineAt(text, from - 1).trim() ? "\n" : "";
  const after = to < text.length && lineAt(text, to + 1).trim() ? "\n" : "";
  const block =
    before + "::: {.signature}\n" + signatureTable(date) + "\n:::" + after;
  const at = from + block.indexOf(NAME_HOLDER);
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: at,
    end: at + NAME_HOLDER.length,
  };
}
