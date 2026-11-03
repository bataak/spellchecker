import { escapedAt, lineAt } from "../core/text.ts";

export interface SkipRange {
  start: number;
  end: number;
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

const FENCE_CLOSE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;

const HTML_BLOCK = /<(pre|code|kbd|samp|tt)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const NO_BLANK = String.raw`(?:(?!\n[ \t]*\n)[\s\S])*?`;

const MATH_BLOCK = new RegExp(
  String.raw`^[ \t]*(?:\\\[` +
    NO_BLANK +
    String.raw`\\\][ \t]*$|\\begin\{((?:equation|align|gather|multline|displaymath|flalign|alignat|aligned|gathered|split|cases|[pbBvV]?matrix|smallmatrix)\*?)\}` +
    NO_BLANK +
    String.raw`\\end\{\1\}|\\begin\{verbatim\}[\s\S]*?\\end\{verbatim\})`,
  "gm",
);

const LATEX_COMMAND =
  /\\(?:begin|end)\{[^}\n]*\}(?:\{[^}\n]*\}|\[[^\]\n]*\])*|\\[A-Za-z]+\*?/g;

function mathPattern(opener: string): RegExp {
  return new RegExp(
    String.raw`\\\(` +
      NO_BLANK +
      String.raw`\\\)|\\begin\{math\}` +
      NO_BLANK +
      String.raw`\\end\{math\}|\$\$` +
      NO_BLANK +
      String.raw`\$\$|` +
      opener +
      String.raw`\$(?![\s$])(?:[^$\n\\]|\\.)*?[^\s$\\]\$(?![\d$])|` +
      opener +
      String.raw`\$(?![\s$])[^$\n\\]\$(?![\d$])`,
    "g",
  );
}

const MATH = mathPattern(String.raw`(?<![\\$\d])`);

const TEX_MATH = mathPattern(String.raw`(?<![\\$])`);

export function lineBounds(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }

  return starts;
}

export function fencedRanges(text: string, starts: number[]): SkipRange[] {
  const ranges: SkipRange[] = [];
  let open = -1;
  let marker = "";

  for (let line = 0; line < starts.length; line += 1) {
    const from = starts[line]!;
    const to = line + 1 < starts.length ? starts[line + 1]! - 1 : text.length;
    const source = text.slice(from, to);
    const match = FENCE.exec(source);

    if (match === null) continue;

    if (open < 0) {
      open = from;
      marker = match[1]!;
      continue;
    }

    const close = FENCE_CLOSE.exec(source);
    if (
      close &&
      close[1]![0] === marker[0] &&
      close[1]!.length >= marker.length
    ) {
      ranges.push({ start: open, end: to });
      open = -1;
      marker = "";
    }
  }

  return ranges;
}

function covered(ranges: SkipRange[], offset: number): boolean {
  for (const range of ranges) {
    if (offset >= range.start && offset < range.end) return true;
  }

  return false;
}

const BLOCK_START =
  /^[ \t]{0,3}(?:#{1,6}(?:[ \t]|$)|>|[-*+][ \t]|\d+[.)][ \t]|\||`{3,}|~{3,}|:{3,})/;

function paragraphLine(line: string): boolean {
  return line.trim() !== "" && !BLOCK_START.test(line);
}

const QUOTE = /^[ \t]{0,3}>[ \t]?/;

function continuesParagraph(line: string, next: string): boolean {
  if (QUOTE.test(line) && QUOTE.test(next))
    return continuesParagraph(line.replace(QUOTE, ""), next.replace(QUOTE, ""));
  return paragraphLine(line) && paragraphLine(next);
}

export function inlineRanges(text: string, fenced: SkipRange[]): SkipRange[] {
  const ranges: SkipRange[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.charCodeAt(index) !== 96) {
      index += 1;
      continue;
    }

    if (covered(fenced, index) || escapedAt(text, index)) {
      index += 1;
      continue;
    }

    let openEnd = index;
    while (openEnd < text.length && text.charCodeAt(openEnd) === 96)
      openEnd += 1;
    const width = openEnd - index;

    let cursor = openEnd;
    let closed = -1;
    let line = lineAt(text, index);

    while (cursor < text.length) {
      const code = text.charCodeAt(cursor);

      if (code === 10) {
        const next = lineAt(text, cursor + 1);
        if (!continuesParagraph(line, next)) break;
        line = next;
        cursor += 1;
        continue;
      }

      if (code === 96) {
        let runEnd = cursor;
        while (runEnd < text.length && text.charCodeAt(runEnd) === 96)
          runEnd += 1;
        if (runEnd - cursor === width) {
          closed = runEnd;
          break;
        }
        cursor = runEnd;
        continue;
      }

      cursor += 1;
    }

    if (closed < 0) {
      index = openEnd;
      continue;
    }

    ranges.push({ start: index, end: closed });
    index = closed;
  }

  return ranges;
}

function htmlRanges(text: string): SkipRange[] {
  const ranges: SkipRange[] = [];
  HTML_BLOCK.lastIndex = 0;

  for (;;) {
    const match = HTML_BLOCK.exec(text);
    if (match === null) break;
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  return ranges;
}

export function mergeRanges(ranges: SkipRange[]): SkipRange[] {
  if (ranges.length === 0) return ranges;

  const ordered = [...ranges].sort((left, right) => left.start - right.start);
  const merged: SkipRange[] = [ordered[0]!];

  for (let index = 1; index < ordered.length; index += 1) {
    const last = merged[merged.length - 1]!;
    const next = ordered[index]!;

    if (next.start <= last.end) last.end = Math.max(last.end, next.end);
    else merged.push({ start: next.start, end: next.end });
  }

  return merged;
}

const MATH_TEXT_ARG =
  /\\(?:text|mbox|textrm|textit|textbf|mathrm|operatorname)\s*\{[^{}]*\}/g;

const CYRILLIC_WORD = /\p{Script=Cyrillic}{2,}/u;

const MATH_MARK = /[\\^_=+{}<>]/;

export function dollarMath(inner: string): boolean {
  const rest = inner.replace(MATH_TEXT_ARG, "");
  return !CYRILLIC_WORD.test(rest) || MATH_MARK.test(rest);
}

function inlineMath(text: string, range: SkipRange): boolean {
  const body = text.slice(range.start, range.end);
  if (body.startsWith("$$") || !body.startsWith("$")) return true;
  return dollarMath(body.slice(1, -1));
}

export function collect(text: string, pattern: RegExp, group = 0): SkipRange[] {
  const ranges: SkipRange[] = [];
  pattern.lastIndex = 0;

  for (;;) {
    const match = pattern.exec(text);
    if (match === null) break;

    const value = match[group];
    if (value === undefined || value === "") continue;

    const start =
      group === 0 ? match.index : match.index + match[0].indexOf(value);
    ranges.push({ start, end: start + value.length });
  }

  return ranges;
}

export function codeRanges(text: string, tex = false): SkipRange[] {
  if (
    text.indexOf("`") < 0 &&
    text.indexOf("~~~") < 0 &&
    text.indexOf("<") < 0 &&
    text.indexOf("$") < 0 &&
    text.indexOf("\\") < 0
  ) {
    return [];
  }

  const starts = lineBounds(text);
  const fenced = fencedRanges(text, starts);

  return mergeRanges([
    ...fenced,
    ...inlineRanges(text, fenced),
    ...htmlRanges(text),
    ...[
      ...(tex
        ? collect(text, TEX_MATH)
        : collect(text, MATH).filter((range) => inlineMath(text, range))),
      ...collect(text, MATH_BLOCK),
      ...collect(text, LATEX_COMMAND),
    ].filter((range) => !covered(fenced, range.start)),
  ]);
}
