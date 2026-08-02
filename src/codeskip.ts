export interface SkipRange {
  start: number;
  end: number;
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const HTML_BLOCK = /<(pre|code|kbd|samp|tt)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function lineBounds(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }

  return starts;
}

function fencedRanges(text: string, starts: number[]): SkipRange[] {
  const ranges: SkipRange[] = [];
  let open = -1;
  let marker = "";

  for (let line = 0; line < starts.length; line += 1) {
    const from = starts[line];
    const to = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
    const source = text.slice(from, to);
    const match = FENCE.exec(source);

    if (match === null) continue;

    if (open < 0) {
      open = from;
      marker = match[1];
      continue;
    }

    if (match[1][0] === marker[0] && match[1].length >= marker.length) {
      ranges.push({ start: open, end: to });
      open = -1;
      marker = "";
    }
  }

  if (open >= 0) ranges.push({ start: open, end: text.length });

  return ranges;
}

function covered(ranges: SkipRange[], offset: number): boolean {
  for (const range of ranges) {
    if (offset >= range.start && offset < range.end) return true;
  }

  return false;
}

function inlineRanges(text: string, fenced: SkipRange[]): SkipRange[] {
  const ranges: SkipRange[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.charCodeAt(index) !== 96) {
      index += 1;
      continue;
    }

    if (covered(fenced, index)) {
      index += 1;
      continue;
    }

    let openEnd = index;
    while (openEnd < text.length && text.charCodeAt(openEnd) === 96)
      openEnd += 1;
    const width = openEnd - index;

    let cursor = openEnd;
    let closed = -1;

    while (cursor < text.length) {
      const code = text.charCodeAt(cursor);

      if (code === 10) break;

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
  const merged: SkipRange[] = [ordered[0]];

  for (let index = 1; index < ordered.length; index += 1) {
    const last = merged[merged.length - 1];
    const next = ordered[index];

    if (next.start <= last.end) last.end = Math.max(last.end, next.end);
    else merged.push({ start: next.start, end: next.end });
  }

  return merged;
}

const BARE_URL = /\b(?:https?|ftps?|mailto|file):\/*[^\s<>()[\]"'`]+/gi;
const WWW_URL = /\bwww\.[^\s<>()[\]"'`]+/gi;
const MD_TARGET = /\]\(\s*([^)]*)\)/g;
const MD_DEFINITION = /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(\S+)/gm;
const AUTOLINK = /<[^\s<>]*(?::\/\/|@)[^\s<>]*>/g;
const TLD =
  "com|org|net|io|dev|mn|edu|gov|info|app|ai|co|me|ru|uk|de|fr|jp|cn|kr|tv|xyz|tech|online|site|page|blog|cloud|sh|gg";

const DOMAIN = new RegExp(
  String.raw`\b(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+(?:${TLD})\b(?:\/[^\s<>()[\]"'\`]*)?`,
  "g",
);

const MD_LABEL = new RegExp(String.raw`\[([^\]\n]+)\](?=\(|\[|:)`, "g");

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

function collect(text: string, pattern: RegExp, group = 0): SkipRange[] {
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

function urlLikeLabels(text: string): SkipRange[] {
  const ranges: SkipRange[] = [];
  MD_LABEL.lastIndex = 0;

  for (;;) {
    const match = MD_LABEL.exec(text);
    if (match === null) break;

    const label = match[1];
    DOMAIN.lastIndex = 0;
    if (!DOMAIN.test(label) && !/^(?:https?|ftp):/i.test(label)) continue;

    const start = match.index + match[0].indexOf(label);
    ranges.push({ start, end: start + label.length });
  }

  return ranges;
}

export function linkRanges(text: string): SkipRange[] {
  return mergeRanges([
    ...collect(text, MD_TARGET, 1),
    ...collect(text, DOMAIN),
    ...urlLikeLabels(text),
    ...collect(text, MD_DEFINITION, 1),
    ...collect(text, AUTOLINK),
    ...collect(text, BARE_URL),
    ...collect(text, WWW_URL),
    ...collect(text, EMAIL),
  ]);
}

export interface SkipOptions {
  code?: boolean;
  links?: boolean;
}

export function skipRanges(
  text: string,
  options: SkipOptions = {},
): SkipRange[] {
  const wantCode = options.code !== false;
  const wantLinks = options.links !== false;

  const ranges: SkipRange[] = [];
  if (wantCode) ranges.push(...codeRanges(text));
  if (wantLinks) ranges.push(...linkRanges(text));

  return mergeRanges(ranges);
}

export function codeRanges(text: string): SkipRange[] {
  if (
    text.indexOf("`") < 0 &&
    text.indexOf("~~~") < 0 &&
    text.indexOf("<") < 0
  ) {
    return [];
  }

  const starts = lineBounds(text);
  const fenced = fencedRanges(text, starts);

  return mergeRanges([
    ...fenced,
    ...inlineRanges(text, fenced),
    ...htmlRanges(text),
  ]);
}

export function inRanges(ranges: SkipRange[], offset: number): boolean {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];

    if (offset < range.start) high = mid - 1;
    else if (offset >= range.end) low = mid + 1;
    else return true;
  }

  return false;
}
