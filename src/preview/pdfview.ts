import type { Line, TextItem } from "./pdftext.ts";
import type { PdfWord } from "../tex/texsync.ts";
import {
  canvasDensity,
  DESKTOP_CANVAS_PIXELS,
  TOUCH_CANVAS_PIXELS,
} from "./viewprefs.ts";
import { covers, detailRect, type Box, type DetailRect } from "./pdfdetail.ts";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  })();
  return pdfjsPromise;
}

let sharedWorker: import("pdfjs-dist").PDFWorker | null = null;

function pdfWorker(
  pdfjs: typeof import("pdfjs-dist"),
): import("pdfjs-dist").PDFWorker {
  if (!sharedWorker || sharedWorker.destroyed)
    sharedWorker = new pdfjs.PDFWorker();
  return sharedWorker;
}

export async function warmPdf(): Promise<void> {
  pdfWorker(await loadPdfjs());
}

function dropWorker(): void {
  sharedWorker?.destroy();
  sharedWorker = null;
}

const ROOT_MARGIN = "900px 0px";

const MAX_DPR = 2;
const DETAIL_MARGIN = 0.25;
const DETAIL_DELAY_MS = 120;

interface Detail {
  canvas: HTMLCanvasElement;
  rect: DetailRect;
  width: number;
}

interface PageSlot {
  el: HTMLElement;
  index: number;
  canvas: HTMLCanvasElement | null;
  task: { cancel: () => void } | null;
  rendering: boolean;
  gen: number;
  density: number;
  detail: Detail | null;
  detailTask: { cancel: () => void } | null;
  detailGen: number;
}

export interface PdfView {
  readonly pages: number;
  setZoom(zoom: number, origin?: { x: number; y: number }): void;
  goTo(page: number): void;
  words(): Promise<readonly PdfWord[]>;
  reveal(page: number, y: number): void;
  pointAt(
    clientX: number,
    clientY: number,
  ): { page: number; x: number; y: number } | null;
  destroy(): void;
}

export interface PdfViewOptions {
  readonly inset?: () => number;
  readonly onPage?: (page: number, pages: number) => void;
}

export async function renderPdfInto(
  host: HTMLElement,
  file: File,
  signal?: AbortSignal,
  zoom = 1,
  options: PdfViewOptions = {},
): Promise<PdfView> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, worker: pdfWorker(pdfjs) });
  const doc = await task.promise.catch((error: unknown) => {
    dropWorker();
    throw error;
  });

  if (signal?.aborted) {
    await task.destroy();
    throw new DOMException("aborted", "AbortError");
  }

  const list = document.createElement("div");
  list.className = "pdf-pages";
  list.style.setProperty("--pdf-zoom", String(zoom));
  host.replaceChildren(list);

  const slots: PageSlot[] = [];
  const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
  const maxPixels = globalThis.matchMedia?.("(pointer: coarse)").matches
    ? TOUCH_CANVAS_PIXELS
    : DESKTOP_CANVAS_PIXELS;

  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  first.cleanup();

  for (let i = 1; i <= doc.numPages; i++) {
    const el = document.createElement("div");
    el.className = "pdf-page";
    el.dataset.page = String(i);
    el.style.aspectRatio = `${base.width} / ${base.height}`;
    list.append(el);
    slots.push({
      el,
      index: i,
      canvas: null,
      task: null,
      rendering: false,
      gen: 0,
      density: dpr,
      detail: null,
      detailTask: null,
      detailGen: 0,
    });
  }

  const snap = (slot: PageSlot): void => {
    if (!slot.canvas) return;
    const box = slot.el.getBoundingClientRect();
    const x = (box.left + slot.el.clientLeft) * dpr;
    const y = (box.top + slot.el.clientTop) * dpr;
    const dx = (Math.round(x) - x) / dpr;
    const dy = (Math.round(y) - y) / dpr;
    const shift = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
    slot.canvas.style.transform = shift;
    if (slot.detail) slot.detail.canvas.style.transform = shift;
  };

  const inset = (): number => options.inset?.() ?? 0;
  const pageAt = (): number => {
    const frame = host.getBoundingClientRect();
    const top = frame.top + host.clientTop + inset();
    const line = top + (frame.bottom - top) * 0.4;
    let low = 0;
    let high = slots.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (slots[mid]!.el.getBoundingClientRect().bottom < line) low = mid + 1;
      else high = mid;
    }
    return low + 1;
  };
  let shownPage = 0;
  const reportPage = (): void => {
    const page = pageAt();
    if (page === shownPage) return;
    shownPage = page;
    options.onPage?.(page, slots.length);
  };

  let snapFrame = 0;
  const onScroll = (): void => {
    if (snapFrame) return;
    snapFrame = requestAnimationFrame(() => {
      snapFrame = 0;
      for (const slot of slots) snap(slot);
      reportPage();
      scheduleDetail();
    });
  };
  host.addEventListener("scroll", onScroll, { passive: true });

  const dropDetail = (slot: PageSlot): void => {
    slot.detailGen++;
    slot.detailTask?.cancel();
    slot.detailTask = null;
    if (!slot.detail) return;
    slot.detail.canvas.remove();
    slot.detail.canvas.width = 0;
    slot.detail.canvas.height = 0;
    slot.detail = null;
  };

  const release = (slot: PageSlot): void => {
    dropDetail(slot);
    slot.gen++;
    slot.task?.cancel();
    slot.task = null;
    if (slot.canvas) {
      slot.canvas.width = 0;
      slot.canvas.height = 0;
      slot.canvas = null;
    }
    slot.el.replaceChildren();
    slot.rendering = false;
  };

  const draw = async (slot: PageSlot): Promise<void> => {
    if (slot.canvas || slot.rendering) return;
    slot.rendering = true;
    const gen = ++slot.gen;
    try {
      const page = await doc.getPage(slot.index);
      const border = slot.el.clientLeft;
      const width = Math.max(
        slot.el.getBoundingClientRect().width - border * 2,
        120,
      );
      const density = canvasDensity(
        width,
        base.height / base.width,
        dpr,
        maxPixels,
      );
      const pixels = Math.round(width * density);
      const viewport = page.getViewport({ scale: pixels / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = pixels;
      canvas.height = Math.round(viewport.height);
      canvas.style.width = canvas.width / density + "px";
      canvas.style.height = canvas.height / density + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render = page.render({ canvas, canvasContext: ctx, viewport });
      slot.task = render;
      await render.promise;
      if (gen !== slot.gen) return;
      slot.task = null;
      if (!slot.rendering) return;
      dropDetail(slot);
      slot.el.replaceChildren(canvas);
      slot.canvas = canvas;
      slot.density = density;
      snap(slot);
      page.cleanup();
      scheduleDetail();
    } catch {
    } finally {
      if (gen === slot.gen) slot.rendering = false;
    }
  };

  const pageBox = (slot: PageSlot): Box => {
    const box = slot.el.getBoundingClientRect();
    return {
      left: box.left + slot.el.clientLeft,
      top: box.top + slot.el.clientTop,
      width: box.width - slot.el.clientLeft * 2,
      height: box.height - slot.el.clientTop * 2,
    };
  };

  const viewBox = (): Box => {
    const frame = host.getBoundingClientRect();
    return {
      left: frame.left + host.clientLeft,
      top: frame.top + host.clientTop,
      width: host.clientWidth,
      height: host.clientHeight,
    };
  };

  const drawDetail = async (slot: PageSlot): Promise<void> => {
    if (zooming || !slot.canvas || slot.density >= dpr) {
      dropDetail(slot);
      return;
    }
    const page = pageBox(slot);
    const view = viewBox();
    const need = detailRect(page, view, 0, dpr);
    if (!need) {
      dropDetail(slot);
      return;
    }
    const held = slot.detail;
    if (held && held.width === page.width && covers(held.rect, need)) return;
    const margin = Math.max(view.width, view.height) * DETAIL_MARGIN;
    const rect = detailRect(page, view, margin, dpr) ?? need;
    slot.detailTask?.cancel();
    slot.detailTask = null;
    const gen = ++slot.detailGen;
    const canvas = document.createElement("canvas");
    try {
      const pdfPage = await doc.getPage(slot.index);
      if (gen !== slot.detailGen) return;
      const viewport = pdfPage.getViewport({
        scale: (page.width * dpr) / base.width,
        offsetX: -rect.x * dpr,
        offsetY: -rect.y * dpr,
      });
      canvas.className = "pdf-detail";
      canvas.width = Math.round(rect.w * dpr);
      canvas.height = Math.round(rect.h * dpr);
      canvas.style.left = rect.x + "px";
      canvas.style.top = rect.y + "px";
      canvas.style.width = rect.w + "px";
      canvas.style.height = rect.h + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render = pdfPage.render({ canvas, canvasContext: ctx, viewport });
      slot.detailTask = render;
      await render.promise;
      if (gen !== slot.detailGen || !slot.canvas) return;
      slot.detailTask = null;
      const old = slot.detail;
      slot.el.append(canvas);
      slot.detail = { canvas, rect, width: page.width };
      if (old) {
        old.canvas.remove();
        old.canvas.width = 0;
        old.canvas.height = 0;
      }
      snap(slot);
    } catch {
    } finally {
      if (slot.detail?.canvas !== canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  };

  let detailTimer = 0;
  const scheduleDetail = (): void => {
    clearTimeout(detailTimer);
    detailTimer = window.setTimeout(() => {
      for (const slot of visible) void drawDetail(slot);
    }, DETAIL_DELAY_MS);
  };

  let found: Promise<readonly PdfWord[]> | null = null;
  const readWords = async (): Promise<readonly PdfWord[]> => {
    const [{ pageLines }, { pdfWords }] = await Promise.all([
      import("./pdftext.ts"),
      import("../tex/texsync.ts"),
    ]);
    const lines: Line[][] = [];
    const heights: number[] = [];
    const widths: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      lines.push(pageLines(content.items as TextItem[]));
      heights.push(page.view[3]! - page.view[1]!);
      widths.push(page.view[2]! - page.view[0]!);
      page.cleanup();
    }
    return pdfWords(lines, heights, widths);
  };

  let mark: HTMLElement | null = null;
  let markTimer = 0;

  const visible = new Set<PageSlot>();
  let zooming = false;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slot = slots[Number(entry.target.getAttribute("data-page")) - 1];
        if (!slot) continue;
        if (entry.isIntersecting) {
          visible.add(slot);
          if (!zooming) void draw(slot);
        } else {
          visible.delete(slot);
          release(slot);
        }
      }
    },
    { root: host, rootMargin: ROOT_MARGIN },
  );
  for (const slot of slots) io.observe(slot.el);

  let resizeTimer = 0;
  const stretch = (): void => {
    for (const canvas of list.querySelectorAll("canvas")) {
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.transform = "";
    }
  };
  const redraw = (delay: number): void => {
    clearTimeout(detailTimer);
    for (const slot of slots) dropDetail(slot);
    stretch();
    zooming = true;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      zooming = false;
      for (const slot of visible) {
        slot.gen++;
        slot.task?.cancel();
        slot.task = null;
        slot.rendering = false;
        slot.canvas = null;
        void draw(slot);
      }
    }, delay);
  };
  let hostWidth = host.clientWidth;
  const ro = new ResizeObserver(() => {
    if (host.clientWidth === hostWidth) return;
    hostWidth = host.clientWidth;
    redraw(200);
  });
  ro.observe(host);

  onScroll();

  const onAbort = (): void => view.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const view: PdfView = {
    pages: slots.length,
    goTo(page) {
      const slot = slots[Math.min(Math.max(page, 1), slots.length) - 1];
      if (!slot) return;
      const frame = host.getBoundingClientRect();
      const top = frame.top + host.clientTop + inset();
      host.scrollTop += slot.el.getBoundingClientRect().top - top - 8;
      shownPage = 0;
      reportPage();
    },
    words() {
      found ??= readWords().catch(() => []);
      return found;
    },
    pointAt(clientX, clientY) {
      for (const slot of slots) {
        const box = slot.el.getBoundingClientRect();
        if (clientY < box.top || clientY > box.bottom) continue;
        if (clientX < box.left || clientX > box.right) return null;
        return {
          page: slot.index,
          x: (clientX - box.left) / box.width,
          y: (clientY - box.top) / box.height,
        };
      }
      return null;
    },
    reveal(page, y) {
      const slot = slots[page - 1];
      if (!slot) return;
      const frame = host.getBoundingClientRect();
      const top = frame.top + host.clientTop + inset();
      const box = slot.el.getBoundingClientRect();
      const at = box.top + slot.el.clientTop + y * slot.el.clientHeight;
      const room = frame.bottom - top;
      if (at < top + room * 0.15 || at > top + room * 0.85)
        host.scrollTop += at - (top + room * 0.35);
      mark ??= document.createElement("div");
      mark.className = "sync-mark";
      const band = slot.el.clientHeight * 0.022;
      mark.style.top =
        slot.el.offsetTop +
        slot.el.clientTop +
        y * slot.el.clientHeight -
        band +
        "px";
      mark.style.left = slot.el.offsetLeft + "px";
      mark.style.width = slot.el.offsetWidth + "px";
      mark.style.height = band * 1.3 + "px";
      mark.classList.remove("is-fading");
      list.append(mark);
      clearTimeout(markTimer);
      markTimer = window.setTimeout(
        () => mark?.classList.add("is-fading"),
        900,
      );
    },
    setZoom(next, origin) {
      if (next === zoom) return;
      const frame = host.getBoundingClientRect();
      const x =
        origin?.x ?? frame.left + host.clientLeft + host.clientWidth / 2;
      const y = origin?.y ?? frame.top + host.clientTop + host.clientHeight / 2;
      let anchor = slots[0];
      let gap = Infinity;
      for (const slot of slots) {
        const box = slot.el.getBoundingClientRect();
        const distance =
          y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
        if (distance < gap) {
          gap = distance;
          anchor = slot;
        }
        if (distance === 0) break;
      }
      const before = anchor?.el.getBoundingClientRect();
      const fx = before ? (x - before.left) / before.width : 0;
      const fy = before ? (y - before.top) / before.height : 0;
      zoom = next;
      list.style.setProperty("--pdf-zoom", String(zoom));
      const after = anchor?.el.getBoundingClientRect();
      if (after) {
        host.scrollLeft += after.left + fx * after.width - x;
        host.scrollTop += after.top + fy * after.height - y;
      }
      redraw(150);
    },
    destroy() {
      signal?.removeEventListener("abort", onAbort);
      host.removeEventListener("scroll", onScroll);
      if (snapFrame) cancelAnimationFrame(snapFrame);
      clearTimeout(resizeTimer);
      clearTimeout(markTimer);
      clearTimeout(detailTimer);
      ro.disconnect();
      io.disconnect();
      for (const slot of slots) release(slot);
      list.remove();
      void task.destroy();
    },
  };
  return view;
}
