export interface SyntaxSpan {
  start: number;
  end: number;
  kind: string;
}

export type Highlighter = (text: string) => SyntaxSpan[];

export function spansInRange<T extends SyntaxSpan>(
  spans: readonly T[],
  start: number,
  end: number,
): T[] {
  let lo = 0;
  let hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid]!.end <= start) lo = mid + 1;
    else hi = mid;
  }
  const out: T[] = [];
  for (let i = lo; i < spans.length && spans[i]!.start < end; i++) {
    out.push(spans[i]!);
  }
  return out;
}
