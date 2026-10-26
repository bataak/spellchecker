import { codeRanges, fencedCode, inRanges } from "../spell/codeskip.ts";
import { replaceRange } from "../editor/editortext.ts";
import { imageAttrs, parseImageAttrs } from "../markdown.ts";
import type { ImageSize } from "../markdown.ts";
import { minimalDiff } from "../core/textdiff.ts";

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

export function lineStartAt(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

export function lineEndAt(text: string, pos: number): number {
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

const LINE_PREFIX =
  /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/;

function trimSpan(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s += 1;
  while (e > s && /\s/.test(text[e - 1]!)) e -= 1;
  return [s, e];
}

function spanWrapped(
  text: string,
  s: number,
  e: number,
  marker: string,
): boolean {
  const ch = marker[0]!;
  return wrapped(
    Math.min(runBefore(text, s, ch), runAfter(text, e, ch)),
    marker,
  );
}

function toggleWrapLines(
  text: string,
  s: number,
  e: number,
  marker: string,
): Edit {
  const spans: [number, number][] = [];
  for (let from = lineStartAt(text, s); from <= e;) {
    const to = lineEndAt(text, from);
    const body = from + LINE_PREFIX.exec(text.slice(from, to))![0].length;
    let [a, b] = trimSpan(text, Math.max(body, s), Math.min(to, e));
    while (a < b && text[a] === marker[0]) a += 1;
    while (b > a && text[b - 1] === marker[0]) b -= 1;
    if (a < b) spans.push([a, b]);
    from = to + 1;
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
  if (text.slice(s, e).includes("\n"))
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

export function lineAt(text: string, index: number): string {
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

export function caretInTable(text: string, caret: number): boolean {
  const from = lineStartAt(text, caret);
  const to = lineEndAt(text, caret);
  return inTable(text, from, to, text.slice(from, to));
}

function inFence(text: string, caret: number): boolean {
  if (!text.includes("```") && !text.includes("~~~")) return false;
  return inRanges(codeRanges(text), caret);
}

const MATH_OPEN: Record<string, string> = { $$: "$$", "\\[": "\\]" };

function mathClose(
  close: string | null,
  line: string,
  blank: boolean,
): string | null {
  if (close) return blank || line.includes(close) ? null : close;
  const opener = line.startsWith("$$")
    ? "$$"
    : line.startsWith("\\[")
      ? "\\["
      : "";
  if (!opener) return null;
  const shut = MATH_OPEN[opener]!;
  return line.slice(opener.length).includes(shut) ? null : shut;
}

function inMath(text: string, caret: number): boolean {
  if (!text.includes("$$") && !text.includes("\\[")) return false;
  const code = fencedCode(text);
  let close: string | null = null;
  let at = 0;
  while (at <= caret) {
    const end = Math.min(lineEndAt(text, at), caret);
    if (!inRanges(code, at)) {
      const line = text.slice(at, end).trim();
      const blank = !text.slice(at, lineEndAt(text, at)).trim();
      close = mathClose(close, line, blank);
    }
    at = end + 1;
  }
  return close !== null;
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

function insertBlock(text: string, caret: number, block: string): Edit {
  const to = lineEndAt(text, caret);
  const line = text.slice(lineStartAt(text, caret), to);
  const head = text.slice(0, to) + (line.trim() ? "\n\n" : "") + block + "\n\n";
  return {
    text: head + text.slice(to).replace(/^\n+/, ""),
    start: head.length,
    end: head.length,
  };
}

export function insertPageBreak(text: string, caret: number): Edit {
  return insertBlock(text, caret, "\\newpage");
}

export function insertImage(text: string, caret: number, src: string): Edit {
  return insertBlock(text, caret, "![](" + src + ")");
}

const IMAGE_TOKEN = /!\[[^\]\n]*\]\([^)\s]+\)(?:\{([^{}\n]*)\})?/g;

export function imageSizeAt(text: string, index: number): ImageSize | null {
  const found = nthImage(text, index);
  return found ? parseImageAttrs(found[1] ?? "") : null;
}

function nthImage(text: string, index: number): RegExpExecArray | null {
  const code = codeRanges(text);
  let n = -1;
  IMAGE_TOKEN.lastIndex = 0;
  for (;;) {
    const m = IMAGE_TOKEN.exec(text);
    if (!m) return null;
    if (inRanges(code, m.index) || text[m.index - 1] === "\\") continue;
    n += 1;
    if (n === index) return m;
  }
}

export function setImageSize(
  text: string,
  index: number,
  change: ImageSize,
  caret: number,
): Edit | null {
  const m = nthImage(text, index);
  if (!m) return null;
  const end = m.index + m[0].length;
  const from = end - (m[1] === undefined ? 0 : m[1].length + 2);
  const attrs = imageAttrs({ ...parseImageAttrs(m[1] ?? ""), ...change });
  const delta = attrs.length - (end - from);
  const at = caret >= end ? caret + delta : caret;
  return {
    text: text.slice(0, from) + attrs + text.slice(end),
    start: at,
    end: at,
  };
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
