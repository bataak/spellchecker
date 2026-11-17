export interface Match {
  readonly from: number;
  readonly to: number;
}

export const MATCH_LIMIT = 10_000;

const SPECIAL = /[.*+?^${}()|[\]\\]/g;

export function findAll(text: string, query: string): Match[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(SPECIAL, "\\$&"), "giu");
  const out: Match[] = [];
  for (const match of text.matchAll(pattern)) {
    out.push({ from: match.index, to: match.index + match[0].length });
    if (out.length >= MATCH_LIMIT) break;
  }
  return out;
}

export function matchAfter(matches: readonly Match[], offset: number): number {
  if (!matches.length) return -1;
  const at = matches.findIndex((m) => m.from >= offset);
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

export function replaceAll(
  text: string,
  matches: readonly Match[],
  replacement: string,
): string {
  let out = "";
  let at = 0;
  for (const match of matches) {
    out += text.slice(at, match.from) + replacement;
    at = match.to;
  }
  return out + text.slice(at);
}
