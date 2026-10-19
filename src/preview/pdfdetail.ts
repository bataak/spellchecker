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
