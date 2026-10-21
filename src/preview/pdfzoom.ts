import { rangeGap } from "./pdfdetail.ts";

export interface Point {
  readonly x: number;
  readonly y: number;
}

function centerOf(host: HTMLElement): Point {
  const frame = host.getBoundingClientRect();
  return {
    x: frame.left + host.clientLeft + host.clientWidth / 2,
    y: frame.top + host.clientTop + host.clientHeight / 2,
  };
}

function nearestPage(pages: readonly HTMLElement[], y: number) {
  let anchor = pages[0];
  let gap = Infinity;
  for (const page of pages) {
    const box = page.getBoundingClientRect();
    const distance = rangeGap(box.top, box.bottom, y, y);
    if (distance < gap) {
      gap = distance;
      anchor = page;
    }
    if (distance === 0) break;
  }
  return anchor;
}

export function keepAnchor(
  host: HTMLElement,
  pages: readonly HTMLElement[],
  origin: Point | undefined,
  resize: () => void,
): void {
  const { x, y } = origin ?? centerOf(host);
  const anchor = nearestPage(pages, y);
  const before = anchor?.getBoundingClientRect();
  const fx = before ? (x - before.left) / before.width : 0;
  const fy = before ? (y - before.top) / before.height : 0;
  resize();
  const after = anchor?.getBoundingClientRect();
  if (!after) return;
  host.scrollLeft += after.left + fx * after.width - x;
  host.scrollTop += after.top + fy * after.height - y;
}

function centeringStep(host: HTMLElement, box: DOMRect): number {
  const frame = host.getBoundingClientRect();
  const left = frame.left + host.clientLeft;
  const right = left + host.clientWidth;
  if (box.width <= host.clientWidth)
    return (left + right - box.width) / 2 - box.left;
  if (box.left > left) return left - box.left;
  if (box.right < right) return right - box.right;
  return 0;
}

export function pinchPages(
  host: HTMLElement,
  list: HTMLElement,
  first: HTMLElement | undefined,
  scale: number,
  origin: Point,
  shift: Point,
): void {
  if (scale === 1 && !shift.x && !shift.y) {
    list.style.transform = "";
    list.style.transformOrigin = "";
    return;
  }
  const frame = host.getBoundingClientRect();
  const x =
    origin.x - frame.left - host.clientLeft + host.scrollLeft - list.offsetLeft;
  const y =
    origin.y - frame.top - host.clientTop + host.scrollTop - list.offsetTop;
  list.style.transformOrigin = `${x}px ${y}px`;
  const place = (dx: number): void => {
    list.style.transform = `translate(${dx}px, ${shift.y}px) scale(${scale})`;
  };
  let dx = shift.x;
  place(dx);
  for (let pass = 0; pass < 8; pass++) {
    const step = first ? centeringStep(host, first.getBoundingClientRect()) : 0;
    if (Math.abs(step) < 0.5) return;
    dx += step;
    place(dx);
  }
}

export function pointOnPage(
  pages: readonly HTMLElement[],
  clientX: number,
  clientY: number,
): { page: number; x: number; y: number } | null {
  for (const [index, page] of pages.entries()) {
    const box = page.getBoundingClientRect();
    if (clientY < box.top || clientY > box.bottom) continue;
    if (clientX < box.left || clientX > box.right) return null;
    return {
      page: index + 1,
      x: (clientX - box.left) / box.width,
      y: (clientY - box.top) / box.height,
    };
  }
  return null;
}
