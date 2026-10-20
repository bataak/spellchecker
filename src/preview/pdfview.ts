import type { Line, TextItem } from "./pdftext.ts";
import type { PdfWord } from "../tex/texsync.ts";
import {
  canvasDensity,
  DESKTOP_CANVAS_PIXELS,
  TOUCH_CANVAS_PIXELS,
} from "./viewprefs.ts";
import {
  covers,
  detailRect,
  pageIndexAt,
  rangeGap,
  revealShift,
  snapShift,
  type Box,
  type DetailRect,
} from "./pdfdetail.ts";
import { noteError } from "../core/errorlog.ts";

function noteUnlessCancelled(error: unknown): void {
  if (error instanceof Error && error.name === "RenderingCancelledException")
    return;
  noteError(error);
}

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
const DETAIL_DELAY_MS = 200;

interface Detail {
  readonly canvas: HTMLCanvasElement;
  readonly rect: DetailRect;
  readonly width: number;
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

export type PdfLoadingTask = ReturnType<
  (typeof import("pdfjs-dist"))["getDocument"]
>;

export interface PdfViewOptions {
  readonly inset?: () => number;
  readonly onPage?: (page: number, pages: number) => void;
  readonly load?: (data: Uint8Array) => PdfLoadingTask;
  readonly behind?: boolean;
}

async function pdfLoader(): Promise<(data: Uint8Array) => PdfLoadingTask> {
  const pdfjs = await loadPdfjs();
  return (data) => pdfjs.getDocument({ data, worker: pdfWorker(pdfjs) });
}

export async function renderPdfInto(
  host: HTMLElement,
  file: File,
  signal?: AbortSignal,
  zoom = 1,
  options: PdfViewOptions = {},
): Promise<PdfView> {
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

  const list = document.createElement("div");
  list.className = "pdf-pages";
  list.style.setProperty("--pdf-zoom", String(zoom));
  if (options.behind) {
    list.classList.add("is-pending");
    host.append(list);
  } else host.replaceChildren(list);

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
    const shift = snapShift(
      box.left + slot.el.clientLeft,
      box.top + slot.el.clientTop,
      dpr,
    );
    slot.canvas.style.transform = shift;
    if (slot.detail) slot.detail.canvas.style.transform = shift;
  };

  const inset = (): number => options.inset?.() ?? 0;
  const pageAt = (): number => {
    const frame = host.getBoundingClientRect();
    const top = frame.top + host.clientTop + inset();
    const line = top + (frame.bottom - top) * 0.4;
    return pageIndexAt(
      slots.length,
      (index) => slots[index]!.el.getBoundingClientRect().bottom,
      line,
    );
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
    });
    scheduleDetail();
  };
  host.addEventListener("scroll", onScroll, { passive: true });

  const freeCanvas = (canvas: HTMLCanvasElement): void => {
    canvas.width = 0;
    canvas.height = 0;
  };

  const dropDetail = (slot: PageSlot): void => {
    slot.detailGen++;
    slot.detailTask?.cancel();
    slot.detailTask = null;
    if (!slot.detail) return;
    slot.detail.canvas.remove();
    freeCanvas(slot.detail.canvas);
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
      slot.density = density;
      if (density >= dpr) dropDetail(slot);
      slot.el.replaceChildren(canvas);
      if (slot.detail) slot.el.append(slot.detail.canvas);
      slot.canvas = canvas;
      snap(slot);
      page.cleanup();
      scheduleDetail();
    } catch (error) {
      noteUnlessCancelled(error);
    } finally {
      if (gen === slot.gen) slot.rendering = false;
    }
  };

  const pageBox = (slot: PageSlot): Box => {
    const box = slot.el.getBoundingClientRect();
    return {
      left: box.left + slot.el.clientLeft,
      top: box.top + slot.el.clientTop,
      width: slot.el.clientWidth,
      height: slot.el.clientHeight,
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

  const percent = (part: number, whole: number): string =>
    (part / whole) * 100 + "%";

  const drawDetail = async (slot: PageSlot): Promise<void> => {
    if (!slot.canvas || slot.rendering || slot.density >= dpr) return;
    const page = pageBox(slot);
    const view = viewBox();
    const need = detailRect(page, view, 0, dpr);
    if (!need) return;
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
      canvas.style.left = percent(rect.x, page.width);
      canvas.style.top = percent(rect.y, page.height);
      canvas.style.width = percent(rect.w, page.width);
      canvas.style.height = percent(rect.h, page.height);
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
        freeCanvas(old.canvas);
      }
      snap(slot);
    } catch (error) {
      noteUnlessCancelled(error);
    } finally {
      if (slot.detail?.canvas !== canvas) freeCanvas(canvas);
    }
  };

  let detailTimer = 0;
  let detailRun = 0;
  function scheduleDetail(): void {
    clearTimeout(detailTimer);
    const run = ++detailRun;
    detailTimer = window.setTimeout(async () => {
      if (zooming) return;
      const order = [...visible]
        .filter((slot) => offscreen(slot) === 0)
        .sort((a, b) => a.index - b.index);
      for (const slot of order) {
        if (run !== detailRun || zooming) return;
        await drawDetail(slot);
      }
    }, DETAIL_DELAY_MS);
  }

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
  let settle = (): void => {};
  const ready = new Promise<void>((resolve) => {
    settle = resolve;
  });
  let firstBatch = true;

  const io = new IntersectionObserver(
    (entries) => {
      const drawing: Promise<void>[] = [];
      for (const entry of entries) {
        const slot = slots[Number(entry.target.getAttribute("data-page")) - 1];
        if (!slot) continue;
        if (entry.isIntersecting) {
          visible.add(slot);
          if (!zooming) drawing.push(draw(slot));
        } else {
          visible.delete(slot);
          release(slot);
        }
      }
      if (!firstBatch) return;
      firstBatch = false;
      void Promise.all(drawing).then(settle);
    },
    { root: host, rootMargin: ROOT_MARGIN },
  );
  for (const slot of slots) io.observe(slot.el);

  let resizeTimer = 0;
  const stretch = (): void => {
    for (const canvas of list.querySelectorAll<HTMLCanvasElement>(
      "canvas:not(.pdf-detail)",
    )) {
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.transform = "";
    }
  };
  function offscreen(slot: PageSlot): number {
    const frame = host.getBoundingClientRect();
    const box = slot.el.getBoundingClientRect();
    return rangeGap(box.top, box.bottom, frame.top, frame.bottom);
  }

  let redrawGen = 0;
  const redraw = (delay: number): void => {
    stretch();
    zooming = true;
    clearTimeout(resizeTimer);
    clearTimeout(detailTimer);
    for (const slot of slots) {
      slot.detailGen++;
      slot.detailTask?.cancel();
      slot.detailTask = null;
    }
    const gen = ++redrawGen;
    resizeTimer = window.setTimeout(async () => {
      zooming = false;
      const order = [...visible].sort((a, b) => offscreen(a) - offscreen(b));
      for (const slot of order) {
        slot.gen++;
        slot.task?.cancel();
        slot.task = null;
        slot.rendering = false;
        slot.canvas = null;
      }
      for (const slot of order) {
        if (gen !== redrawGen) return;
        if (visible.has(slot)) await draw(slot);
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
    ready,
    show() {
      list.classList.remove("is-pending");
    },
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
      const delta = revealShift(at, top, frame.bottom);
      if (delta) host.scrollTop += delta;
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
        const distance = rangeGap(box.top, box.bottom, y, y);
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
    pinch(scale, origin, shift) {
      if (scale === 1 && !shift.x && !shift.y) {
        list.style.transform = "";
        list.style.transformOrigin = "";
        return;
      }
      const frame = host.getBoundingClientRect();
      const x =
        origin.x -
        frame.left -
        host.clientLeft +
        host.scrollLeft -
        list.offsetLeft;
      const y =
        origin.y - frame.top - host.clientTop + host.scrollTop - list.offsetTop;
      list.style.transformOrigin = `${x}px ${y}px`;
      const place = (dx: number): void => {
        list.style.transform = `translate(${dx}px, ${shift.y}px) scale(${scale})`;
      };
      const left = frame.left + host.clientLeft;
      const right = left + host.clientWidth;
      const fix = (box: DOMRect): number => {
        if (box.width <= host.clientWidth)
          return (left + right - box.width) / 2 - box.left;
        if (box.left > left) return left - box.left;
        if (box.right < right) return right - box.right;
        return 0;
      };
      let dx = shift.x;
      place(dx);
      for (let pass = 0; pass < 8; pass++) {
        const box = slots[0]?.el.getBoundingClientRect();
        const step = box ? fix(box) : 0;
        if (Math.abs(step) < 0.5) return;
        dx += step;
        place(dx);
      }
    },
    destroy() {
      settle();
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
