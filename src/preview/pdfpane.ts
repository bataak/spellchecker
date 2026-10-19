import type { PdfView } from "./pdfview.ts";
import type { PreviewHead, ZoomAction } from "./previewhead.ts";
import {
  loadZoom,
  pinchZoom,
  saveZoom,
  stepZoom,
  touchMid,
  touchSpan,
  wheelZoom,
} from "./viewprefs.ts";

export interface PdfPane {
  view(): PdfView | null;
  shown(): Uint8Array<ArrayBuffer> | null;
  syncZoom(): void;
  zoom(action: ZoomAction): void;
  goTo(page: number): void;
  drop(): void;
  render(file: File, onError: () => void): Promise<void>;
  showBytes(
    bytes: Uint8Array<ArrayBuffer>,
    beforeRender: () => boolean,
  ): Promise<boolean>;
}

export function createPdfPane(
  panel: HTMLElement,
  body: HTMLElement,
  head: () => PreviewHead,
): PdfPane {
  let view: PdfView | null = null;
  let abort: AbortController | null = null;
  let shown: Uint8Array<ArrayBuffer> | null = null;
  let zoom = loadZoom();

  const setZoom = (next: number, origin?: { x: number; y: number }): void => {
    zoom = next;
    saveZoom(zoom);
    head().showZoom(zoom);
    view?.setZoom(zoom, origin);
  };

  const options = {
    inset: () => head().head.offsetHeight,
    onPage: (page: number, total: number) => head().showPage(page, total),
  };

  const setView = (next: PdfView | null): void => {
    view = next;
    panel.classList.toggle("has-pages", next !== null);
    if (!next) head().closePageInput();
  };

  const drop = (): void => {
    shown = null;
    abort?.abort();
    abort = null;
    view?.destroy();
    setView(null);
  };

  const renderFile = async (
    file: File,
    controller: AbortController,
  ): Promise<PdfView | null> => {
    const mod = await import("./pdfview.ts");
    if (controller.signal.aborted) return null;
    const next = await mod.renderPdfInto(
      body,
      file,
      controller.signal,
      zoom,
      options,
    );
    if (controller.signal.aborted) {
      next.destroy();
      return null;
    }
    setView(next);
    return next;
  };

  body.addEventListener(
    "wheel",
    (event) => {
      if (!view || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!event.deltaY) return;
      setZoom(wheelZoom(zoom, event), { x: event.clientX, y: event.clientY });
    },
    { passive: false },
  );

  interface Pinch {
    readonly span: number;
    readonly x: number;
    readonly y: number;
    next: number;
    dx: number;
    dy: number;
  }
  let pinch: Pinch | null = null;
  body.addEventListener(
    "touchstart",
    (event) => {
      const [a, b] = event.touches;
      if (!view || event.touches.length !== 2 || !a || !b) return;
      const mid = touchMid(a, b);
      pinch = { span: touchSpan(a, b), ...mid, next: zoom, dx: 0, dy: 0 };
    },
    { passive: true },
  );
  body.addEventListener(
    "touchmove",
    (event) => {
      const [a, b] = event.touches;
      if (!pinch || event.touches.length !== 2 || !a || !b) return;
      event.preventDefault();
      const mid = touchMid(a, b);
      pinch.next = pinchZoom(zoom, pinch.span, touchSpan(a, b));
      pinch.dx = mid.x - pinch.x;
      pinch.dy = mid.y - pinch.y;
      head().showZoom(pinch.next);
      view?.pinch(pinch.next / zoom, pinch, { x: pinch.dx, y: pinch.dy });
    },
    { passive: false },
  );
  const endPinch = (event: TouchEvent): void => {
    if (!pinch || event.touches.length >= 2) return;
    const done = pinch;
    pinch = null;
    view?.pinch(1, done, { x: 0, y: 0 });
    if (done.next !== zoom) setZoom(done.next, done);
    else head().showZoom(zoom);
    body.scrollLeft -= done.dx;
    body.scrollTop -= done.dy;
  };
  body.addEventListener("touchend", endPinch);
  body.addEventListener("touchcancel", endPinch);

  return {
    view: () => view,
    shown: () => shown,
    syncZoom: () => setZoom(zoom),
    zoom(action) {
      setZoom(
        action === "reset" ? 1 : stepZoom(zoom, action === "in" ? 1 : -1),
      );
    },
    goTo: (page) => view?.goTo(page),
    drop,
    async render(file, onError) {
      const controller = new AbortController();
      abort = controller;
      try {
        await renderFile(file, controller);
      } catch {
        if (!controller.signal.aborted) onError();
      }
    },
    async showBytes(bytes, beforeRender) {
      await import("./pdfview.ts");
      const scroll = body.scrollTop;
      if (!beforeRender()) return false;
      const controller = new AbortController();
      abort = controller;
      const file = new File([bytes], "preview.pdf", {
        type: "application/pdf",
      });
      if (!(await renderFile(file, controller))) return false;
      shown = bytes;
      panel.classList.remove("is-blank");
      body.classList.remove("is-empty");
      body.scrollTop = scroll;
      return true;
    },
  };
}
