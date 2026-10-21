import type { PDFDocumentProxy } from "pdfjs-dist";
import { createSyncMark } from "./syncmark.ts";
import type { PdfWord } from "../tex/texsync.ts";
import { DESKTOP_CANVAS_PIXELS, TOUCH_CANVAS_PIXELS } from "./viewprefs.ts";
import { pageIndexAt, rangeGap, revealShift } from "./pdfdetail.ts";
import { dropWorker, pdfLoader, type PdfLoadingTask } from "./pdfloader.ts";
import {
  createPagePainter,
  pageSlot,
  type PagePainter,
  type PageSlot,
} from "./pdfpaint.ts";
import { readPdfWords } from "./pdfwords.ts";
import { keepAnchor, pinchPages, pointOnPage } from "./pdfzoom.ts";

export { warmPdf, type PdfLoadingTask } from "./pdfloader.ts";

const ROOT_MARGIN = "900px 0px";
const MAX_DPR = 2;
const DETAIL_DELAY_MS = 200;

export interface PdfView {
  readonly pages: number;
  readonly ready: Promise<void>;
  show(): void;
  setZoom(zoom: number, origin?: { x: number; y: number }): void;
  pinch(
    scale: number,
    origin: { x: number; y: number },
    shift: { x: number; y: number },
  ): void;
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
  readonly load?: (data: Uint8Array) => PdfLoadingTask;
  readonly behind?: boolean;
}

interface Pages {
  readonly list: HTMLElement;
  readonly slots: PageSlot[];
  readonly base: { readonly width: number; readonly height: number };
}

async function buildPages(
  host: HTMLElement,
  doc: PDFDocumentProxy,
  zoom: number,
  behind: boolean,
  dpr: number,
): Promise<Pages> {
  const list = document.createElement("div");
  list.className = "pdf-pages";
  list.style.setProperty("--pdf-zoom", String(zoom));
  if (behind) {
    list.classList.add("is-pending");
    host.append(list);
  } else host.replaceChildren(list);
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  first.cleanup();
  const slots: PageSlot[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const el = document.createElement("div");
    el.className = "pdf-page";
    el.dataset.page = String(i);
    el.style.aspectRatio = `${base.width} / ${base.height}`;
    list.append(el);
    slots.push(pageSlot(el, i, dpr));
  }
  return { list, slots, base };
}

interface DrawQueue {
  readonly ready: Promise<void>;
  settle(): void;
  scheduleDetail(): void;
  redraw(delay: number): void;
  stop(): void;
}

function createDrawQueue(
  host: HTMLElement,
  { list, slots }: Pages,
  painter: () => PagePainter,
): DrawQueue {
  const visible = new Set<PageSlot>();
  let zooming = false;
  let settle = (): void => {};
  const ready = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const offscreen = (slot: PageSlot): number => {
    const frame = host.getBoundingClientRect();
    const box = slot.el.getBoundingClientRect();
    return rangeGap(box.top, box.bottom, frame.top, frame.bottom);
  };

  let detailTimer = 0;
  let detailRun = 0;
  const scheduleDetail = (): void => {
    clearTimeout(detailTimer);
    const run = ++detailRun;
    detailTimer = window.setTimeout(async () => {
      if (zooming) return;
      const order = [...visible]
        .filter((slot) => offscreen(slot) === 0)
        .sort((a, b) => a.index - b.index);
      for (const slot of order) {
        if (run !== detailRun || zooming) return;
        await painter().drawDetail(slot);
      }
    }, DETAIL_DELAY_MS);
  };

  let firstBatch = true;
  const io = new IntersectionObserver(
    (entries) => {
      const drawing: Promise<void>[] = [];
      for (const entry of entries) {
        const slot = slots[Number(entry.target.getAttribute("data-page")) - 1];
        if (!slot) continue;
        if (entry.isIntersecting) {
          visible.add(slot);
          if (!zooming) drawing.push(painter().draw(slot));
        } else {
          visible.delete(slot);
          painter().release(slot);
        }
      }
      if (!firstBatch) return;
      firstBatch = false;
      void Promise.all(drawing).then(settle);
    },
    { root: host, rootMargin: ROOT_MARGIN },
  );
  for (const slot of slots) io.observe(slot.el);

  const stretch = (): void => {
    for (const canvas of list.querySelectorAll<HTMLCanvasElement>(
      "canvas:not(.pdf-detail)",
    )) {
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.transform = "";
    }
  };

  let resizeTimer = 0;
  let redrawGen = 0;
  const redraw = (delay: number): void => {
    stretch();
    zooming = true;
    clearTimeout(resizeTimer);
    clearTimeout(detailTimer);
    for (const slot of slots) painter().cancelDetail(slot);
    const gen = ++redrawGen;
    resizeTimer = window.setTimeout(async () => {
      zooming = false;
      const order = [...visible].sort((a, b) => offscreen(a) - offscreen(b));
      for (const slot of order) painter().invalidate(slot);
      for (const slot of order) {
        if (gen !== redrawGen) return;
        if (visible.has(slot)) await painter().draw(slot);
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

  return {
    ready,
    settle: () => settle(),
    scheduleDetail,
    redraw,
    stop() {
      clearTimeout(resizeTimer);
      clearTimeout(detailTimer);
      ro.disconnect();
      io.disconnect();
    },
  };
}

function maxCanvasPixels(): number {
  return globalThis.matchMedia?.("(pointer: coarse)").matches
    ? TOUCH_CANVAS_PIXELS
    : DESKTOP_CANVAS_PIXELS;
}

async function openDocument(
  file: File,
  options: PdfViewOptions,
  signal?: AbortSignal,
): Promise<{ task: PdfLoadingTask; doc: PDFDocumentProxy }> {
  const load = options.load ?? (await pdfLoader());
  const data = new Uint8Array(await file.arrayBuffer());
  const task = load(data);
  const doc = await task.promise.catch((error: unknown) => {
    dropWorker();
    throw error;
  });
  if (signal?.aborted) {
    await task.destroy();
    throw new DOMException("aborted", "AbortError");
  }
  return { task, doc };
}

export async function renderPdfInto(
  host: HTMLElement,
  file: File,
  signal?: AbortSignal,
  zoom = 1,
  options: PdfViewOptions = {},
): Promise<PdfView> {
  const { task, doc } = await openDocument(file, options, signal);
  const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
  const built = await buildPages(host, doc, zoom, !!options.behind, dpr);
  const { list, slots, base } = built;
  const pages = slots.map((slot) => slot.el);
  const queue = createDrawQueue(host, built, () => painter);
  const painter = createPagePainter({
    doc,
    host,
    base,
    dpr,
    maxPixels: maxCanvasPixels(),
    painted: () => queue.scheduleDetail(),
  });

  const inset = (): number => options.inset?.() ?? 0;
  const viewTop = (): number =>
    host.getBoundingClientRect().top + host.clientTop + inset();
  let shownPage = 0;
  const reportPage = (): void => {
    const top = viewTop();
    const line = top + (host.getBoundingClientRect().bottom - top) * 0.4;
    const rectOf = (index: number) => pages[index]!.getBoundingClientRect();
    const page = pageIndexAt(pages.length, (i) => rectOf(i).bottom, line);
    if (page === shownPage) return;
    shownPage = page;
    options.onPage?.(page, pages.length);
  };

  let snapFrame = 0;
  const onScroll = (): void => {
    if (snapFrame) return;
    snapFrame = requestAnimationFrame(() => {
      snapFrame = 0;
      for (const slot of slots) painter.snap(slot);
      reportPage();
    });
    queue.scheduleDetail();
  };
  host.addEventListener("scroll", onScroll, { passive: true });

  const syncMark = createSyncMark(list);
  const margins: (number | null)[] = [];
  let found: Promise<readonly PdfWord[]> | null = null;

  onScroll();

  const onAbort = (): void => view.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const view: PdfView = {
    pages: slots.length,
    ready: queue.ready,
    show() {
      list.classList.remove("is-pending");
    },
    goTo(page) {
      const el = pages[Math.min(Math.max(page, 1), pages.length) - 1];
      if (!el) return;
      host.scrollTop += el.getBoundingClientRect().top - viewTop() - 8;
      shownPage = 0;
      reportPage();
    },
    words() {
      found ??= readPdfWords(doc, margins).catch(() => []);
      return found;
    },
    pointAt: (clientX, clientY) => pointOnPage(pages, clientX, clientY),
    reveal(page, y) {
      const el = pages[page - 1];
      if (!el) return;
      const box = el.getBoundingClientRect();
      const at = box.top + el.clientTop + y * el.clientHeight;
      const bottom = host.getBoundingClientRect().bottom;
      const delta = revealShift(at, viewTop(), bottom);
      if (delta) host.scrollTop += delta;
      syncMark.show(el, y, margins[page - 1] ?? null);
    },
    setZoom(next, origin) {
      if (next === zoom) return;
      keepAnchor(host, pages, origin, () => {
        zoom = next;
        list.style.setProperty("--pdf-zoom", String(zoom));
      });
      queue.redraw(150);
    },
    pinch: (scale, origin, shift) =>
      pinchPages(host, list, pages[0], scale, origin, shift),
    destroy() {
      queue.settle();
      signal?.removeEventListener("abort", onAbort);
      host.removeEventListener("scroll", onScroll);
      if (snapFrame) cancelAnimationFrame(snapFrame);
      queue.stop();
      syncMark.clear();
      for (const slot of slots) painter.release(slot);
      list.remove();
      void task.destroy();
    },
  };
  return view;
}
