import { casePattern, fitCase } from "../spell/caseform.ts";

export interface Match {
  readonly from: number;
  readonly to: number;
}

export const MATCH_LIMIT = 10_000;

const SPECIAL = /[.*+?^${}()|[\]\\]/g;

const EDGE = "[\\p{L}\\p{M}\\p{N}]";

export interface Edit {
  readonly from: number;
  readonly to: number;
  readonly size: number;
}

export function findAll(
  text: string,
  query: string,
  whole = false,
  exact = false,
  limit = MATCH_LIMIT,
): Match[] {
  if (!query) return [];
  const body = query.replace(SPECIAL, "\\$&");
  const source = whole ? "(?<!" + EDGE + ")" + body + "(?!" + EDGE + ")" : body;
  const pattern = new RegExp(source, exact ? "gu" : "giu");
  const out: Match[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ from: match.index, to: match.index + match[0].length });
    if (out.length >= limit) break;
  }
  return out;
}

export function matchAfter(matches: readonly Match[], offset: number): number {
  if (!matches.length) return -1;
  const at = matches.findIndex((m) => m.from >= offset);
  return at === -1 ? 0 : at;
}

export function matchAt(matches: readonly Match[], offset: number): number {
  if (!matches.length) return -1;
  const at = matches.findIndex((m) => m.to > offset);
  return at === -1 ? 0 : at;
}

export function matchBefore(matches: readonly Match[], offset: number): number {
  if (!matches.length) return -1;
  for (let i = matches.length - 1; i >= 0; i--)
    if (matches[i]!.from < offset) return i;
  return matches.length - 1;
}

export function matchesIn(
  matches: readonly Match[],
  from: number,
  to: number,
): Match[] {
  let low = 0;
  let high = matches.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (matches[mid]!.to < from) low = mid + 1;
    else high = mid;
  }
  const out: Match[] = [];
  for (let i = low; i < matches.length && matches[i]!.from <= to; i++)
    out.push(matches[i]!);
  return out;
}

export function replaceEdits(
  text: string,
  matches: readonly Match[],
  query: string,
  replacement: string,
  exact = false,
): { text: string; edits: Edit[] } {
  const primary = casePattern(query);
  const edits: Edit[] = [];
  let out = "";
  let at = 0;
  for (const match of matches) {
    const found = text.slice(match.from, match.to);
    const put = exact ? replacement : fitCase(found, replacement, primary);
    out += text.slice(at, match.from) + put;
    edits.push({ from: match.from, to: match.to, size: put.length });
    at = match.to;
  }
  return { text: out + text.slice(at), edits };
}

export function replaceAll(
  text: string,
  matches: readonly Match[],
  query: string,
  replacement: string,
): string {
  return replaceEdits(text, matches, query, replacement).text;
}

export function shiftOffset(offset: number, edits: readonly Edit[]): number {
  let delta = 0;
  for (const edit of edits) {
    if (edit.to <= offset) delta += edit.size - (edit.to - edit.from);
    else if (edit.from < offset) return edit.from + delta;
    else break;
  }
  return offset + delta;
}
