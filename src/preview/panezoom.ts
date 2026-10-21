import type { PdfView } from "./pdfview.ts";
import { pinchZoom, touchMid, touchSpan, wheelZoom } from "./viewprefs.ts";

export interface ZoomGestureDeps {
  readonly view: () => PdfView | null;
  readonly zoom: () => number;
  readonly setZoom: (next: number, origin?: { x: number; y: number }) => void;
  readonly showZoom: (zoom: number) => void;
}

interface Pinch {
  readonly span: number;
  readonly x: number;
  readonly y: number;
  next: number;
  dx: number;
  dy: number;
}

export function bindZoomGestures(body: HTMLElement, d: ZoomGestureDeps): void {
  body.addEventListener(
    "wheel",
    (event) => {
      if (!d.view() || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!event.deltaY) return;
      d.setZoom(wheelZoom(d.zoom(), event), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { passive: false },
  );

  let pinch: Pinch | null = null;
  body.addEventListener(
    "touchstart",
    (event) => {
      const [a, b] = event.touches;
      if (!d.view() || event.touches.length !== 2 || !a || !b) return;
      const mid = touchMid(a, b);
      pinch = { span: touchSpan(a, b), ...mid, next: d.zoom(), dx: 0, dy: 0 };
    },
    { passive: true },
  );
  body.addEventListener(
    "touchmove",
    (event) => {
      const [a, b] = event.touches;
      if (!pinch || event.touches.length !== 2 || !a || !b) return;
      event.preventDefault();
      const zoom = d.zoom();
      const mid = touchMid(a, b);
      pinch.next = pinchZoom(zoom, pinch.span, touchSpan(a, b));
      pinch.dx = mid.x - pinch.x;
      pinch.dy = mid.y - pinch.y;
      d.showZoom(pinch.next);
      d.view()?.pinch(pinch.next / zoom, pinch, { x: pinch.dx, y: pinch.dy });
    },
    { passive: false },
  );
  const endPinch = (event: TouchEvent): void => {
    if (!pinch || event.touches.length >= 2) return;
    const done = pinch;
    pinch = null;
    d.view()?.pinch(1, done, { x: 0, y: 0 });
    if (done.next !== d.zoom()) d.setZoom(done.next, done);
    else d.showZoom(d.zoom());
    body.scrollLeft -= done.dx;
    body.scrollTop -= done.dy;
  };
  body.addEventListener("touchend", endPinch);
  body.addEventListener("touchcancel", endPinch);
}
