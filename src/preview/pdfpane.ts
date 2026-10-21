import type { PdfView } from "./pdfview.ts";
import type { PreviewHead, ZoomAction } from "./previewhead.ts";
import { loadZoom, saveZoom, stepZoom } from "./viewprefs.ts";
import { bindZoomGestures } from "./panezoom.ts";
import { keepScrollX } from "./panescroll.ts";

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
  let rendering = 0;
  const restoreScrollX = keepScrollX(body, () => !!view && rendering === 0);

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
        const scroll = body.scrollTop;
        abort?.abort();
        abort = controller;
        next.show();
        if (zoom !== start) next.setZoom(zoom);
        body.scrollTop = scroll;
      }
      setView(next);
      restoreScrollX();
      return next;
    } finally {
      rendering -= 1;
    }
  };

  bindZoomGestures(body, {
    view: () => view,
    zoom: () => zoom,
    setZoom,
    showZoom: (next) => head().showZoom(next),
  });

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
      if (!behind) body.scrollTop = scroll;
      return true;
    },
  };
}
