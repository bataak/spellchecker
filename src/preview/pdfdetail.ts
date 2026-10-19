export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface DetailRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function detailRect(
  page: Box,
  view: Box,
  margin: number,
  dpr: number,
): DetailRect | null {
  const left = Math.max(view.left - margin, page.left) - page.left;
  const top = Math.max(view.top - margin, page.top) - page.top;
  const right =
    Math.min(view.left + view.width + margin, page.left + page.width) -
    page.left;
  const bottom =
    Math.min(view.top + view.height + margin, page.top + page.height) -
    page.top;
  if (right <= left || bottom <= top) return null;
  const x0 = Math.floor(left * dpr);
  const y0 = Math.floor(top * dpr);
  const x1 = Math.min(Math.ceil(right * dpr), Math.floor(page.width * dpr));
  const y1 = Math.min(Math.ceil(bottom * dpr), Math.floor(page.height * dpr));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0 / dpr, y: y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr };
}

export function covers(have: DetailRect, need: DetailRect): boolean {
  return (
    have.x <= need.x &&
    have.y <= need.y &&
    have.x + have.w >= need.x + need.w &&
    have.y + have.h >= need.y + need.h
  );
}

export function snapShift(x: number, y: number, dpr: number): string {
  const px = x * dpr;
  const py = y * dpr;
  const dx = (Math.round(px) - px) / dpr;
  const dy = (Math.round(py) - py) / dpr;
  return dx || dy ? `translate(${dx}px, ${dy}px)` : "";
}

export function pageIndexAt(
  count: number,
  bottomOf: (index: number) => number,
  line: number,
): number {
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (bottomOf(mid) < line) low = mid + 1;
    else high = mid;
  }
  return low + 1;
}

export function rangeGap(
  top: number,
  bottom: number,
  from: number,
  to: number,
): number {
  if (bottom < from) return from - bottom;
  if (top > to) return top - to;
  return 0;
}

export function revealShift(at: number, top: number, bottom: number): number {
  const room = bottom - top;
  if (at >= top + room * 0.15 && at <= top + room * 0.85) return 0;
  return at - (top + room * 0.35);
}
