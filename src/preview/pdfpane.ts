import type { PdfView } from "./pdfview.ts";
import type { PreviewHead, ZoomAction } from "./previewhead.ts";
import {
  loadScrollX,
  loadZoom,
  pinchZoom,
  saveScrollX,
  saveZoom,
  scrollRatio,
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

const SWAP_WAIT_MS = 1500;

export function createPdfPane(
  panel: HTMLElement,
  body: HTMLElement,
  head: () => PreviewHead,
): PdfPane {
  let view: PdfView | null = null;
  let abort: AbortController | null = null;
  let pending: AbortController | null = null;
  let shown: Uint8Array<ArrayBuffer> | null = null;
  let zoom = loadZoom();
  let scrollX = loadScrollX();
  let rendering = 0;
  let saveTimer: number | undefined;

  const flushScrollX = (): void => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (scrollX !== null) saveScrollX(scrollX);
  };

  body.addEventListener(
    "scroll",
    () => {
      if (!view || rendering > 0) return;
      const ratio = scrollRatio(
        body.scrollLeft,
        body.scrollWidth - body.clientWidth,
      );
      if (ratio === null || ratio === scrollX) return;
      scrollX = ratio;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flushScrollX, 300);
    },
    { passive: true },
  );
  window.addEventListener("pagehide", () => {
    if (saveTimer !== undefined) flushScrollX();
  });

  const restoreScrollX = (): void => {
    const range = body.scrollWidth - body.clientWidth;
    if (scrollX !== null && range > 0)
      body.scrollLeft = Math.round(scrollX * range);
  };

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
    pending?.abort();
    pending = null;
    abort?.abort();
    abort = null;
    view?.destroy();
    setView(null);
  };

  const renderFile = async (
    file: File,
    controller: AbortController,
    behind = false,
  ): Promise<PdfView | null> => {
    const mod = await import("./pdfview.ts");
    if (controller.signal.aborted) return null;
    rendering += 1;
    const start = zoom;
    try {
      const next = await mod.renderPdfInto(
        body,
        file,
        controller.signal,
        zoom,
        { ...options, behind },
      );
      if (behind)
        await Promise.race([
          next.ready,
          new Promise((resolve) => setTimeout(resolve, SWAP_WAIT_MS)),
        ]);
      if (controller.signal.aborted) {
        next.destroy();
        return null;
      }
      if (behind) {
        abort?.abort();
        abort = controller;
        next.show();
        if (zoom !== start) next.setZoom(zoom);
      }
      setView(next);
      restoreScrollX();
      return next;
    } finally {
      rendering -= 1;
    }
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
      const behind = view !== null;
      pending?.abort();
      const controller = new AbortController();
      if (behind) pending = controller;
      else abort = controller;
      const file = new File([bytes], "preview.pdf", {
        type: "application/pdf",
      });
      const next = await renderFile(file, controller, behind);
      if (pending === controller) pending = null;
      if (!next) return false;
      shown = bytes;
      panel.classList.remove("is-blank");
      body.classList.remove("is-empty");
      body.scrollTop = scroll;
      return true;
    },
  };
}
