import { noteError } from "../core/errorlog.ts";
import type { PdfView, PdfViewOptions } from "./pdfview.ts";
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

interface RenderTarget {
  readonly body: HTMLElement;
  readonly options: PdfViewOptions;
  readonly zoom: () => number;
  readonly takeOver: (controller: AbortController) => void;
}

async function renderBehindOrNot(
  render: typeof import("./pdfview.ts").renderPdfInto,
  file: File,
  controller: AbortController,
  behind: boolean,
  t: RenderTarget,
): Promise<PdfView | null> {
  const start = t.zoom();
  const next = await render(t.body, file, controller.signal, start, {
    ...t.options,
    behind,
  });
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
    const scroll = t.body.scrollTop;
    t.takeOver(controller);
    next.show();
    if (t.zoom() !== start) next.setZoom(t.zoom());
    t.body.scrollTop = scroll;
  }
  return next;
}

function pdfFile(bytes: Uint8Array<ArrayBuffer>): File {
  return new File([bytes], "preview.pdf", { type: "application/pdf" });
}

function createPaneZoom(
  body: HTMLElement,
  head: () => PreviewHead,
  view: () => PdfView | null,
) {
  let zoom = loadZoom();
  const set = (next: number, origin?: { x: number; y: number }): void => {
    zoom = next;
    saveZoom(zoom);
    head().showZoom(zoom);
    view()?.setZoom(zoom, origin);
  };
  bindZoomGestures(body, {
    view,
    zoom: () => zoom,
    setZoom: set,
    showZoom: (next) => head().showZoom(next),
  });
  return {
    get: () => zoom,
    sync: () => set(zoom),
    step(action: ZoomAction): void {
      set(action === "reset" ? 1 : stepZoom(zoom, action === "in" ? 1 : -1));
    },
  };
}

export function createPdfPane(
  panel: HTMLElement,
  body: HTMLElement,
  head: () => PreviewHead,
): PdfPane {
  let view: PdfView | null = null;
  let abort: AbortController | null = null;
  let pending: AbortController | null = null;
  let shown: Uint8Array<ArrayBuffer> | null = null;
  let rendering = 0;
  const restoreScrollX = keepScrollX(body, () => !!view && rendering === 0);

  const zoom = createPaneZoom(body, head, () => view);

  const target: RenderTarget = {
    body,
    options: {
      inset: () => head().head.offsetHeight,
      onPage: (page, total) => head().showPage(page, total),
    },
    zoom: zoom.get,
    takeOver: (controller) => {
      abort?.abort();
      abort = controller;
    },
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
    try {
      const next = await renderBehindOrNot(
        mod.renderPdfInto,
        file,
        controller,
        behind,
        target,
      );
      if (!next) return null;
      setView(next);
      restoreScrollX();
      return next;
    } finally {
      rendering -= 1;
    }
  };

  return {
    view: () => view,
    shown: () => shown,
    syncZoom: zoom.sync,
    zoom: zoom.step,
    goTo: (page) => view?.goTo(page),
    drop,
    async render(file, onError) {
      const controller = new AbortController();
      abort = controller;
      try {
        await renderFile(file, controller);
      } catch (error) {
        if (controller.signal.aborted) return;
        noteError(error);
        onError();
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
      const next = await renderFile(pdfFile(bytes), controller, behind);
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
