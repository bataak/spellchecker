import type { Line, TextItem } from "./pdftext.ts";
import type { PdfWord } from "../tex/texsync.ts";
import {
  canvasDensity,
  DESKTOP_CANVAS_PIXELS,
  TOUCH_CANVAS_PIXELS,
} from "./viewprefs.ts";

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

interface PageSlot {
  el: HTMLElement;
  index: number;
  canvas: HTMLCanvasElement | null;
  task: { cancel: () => void } | null;
  rendering: boolean;
  gen: number;
}

export interface PdfView {
  readonly pages: number;
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
    });
  }

  const snap = (slot: PageSlot): void => {
    if (!slot.canvas) return;
    const box = slot.el.getBoundingClientRect();
    const x = (box.left + slot.el.clientLeft) * dpr;
    const y = (box.top + slot.el.clientTop) * dpr;
    const dx = (Math.round(x) - x) / dpr;
    const dy = (Math.round(y) - y) / dpr;
    slot.canvas.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : "";
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
    });
  };
  host.addEventListener("scroll", onScroll, { passive: true });

  const release = (slot: PageSlot): void => {
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
      slot.el.replaceChildren(canvas);
      slot.canvas = canvas;
      snap(slot);
      page.cleanup();
    } catch {
    } finally {
      if (gen === slot.gen) slot.rendering = false;
    }
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
  const offscreen = (slot: PageSlot): number => {
    const frame = host.getBoundingClientRect();
    const box = slot.el.getBoundingClientRect();
    if (box.bottom < frame.top) return frame.top - box.bottom;
    if (box.top > frame.bottom) return box.top - frame.bottom;
    return 0;
  };

  let redrawGen = 0;
  const redraw = (delay: number): void => {
    stretch();
    zooming = true;
    clearTimeout(resizeTimer);
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
      signal?.removeEventListener("abort", onAbort);
      host.removeEventListener("scroll", onScroll);
      if (snapFrame) cancelAnimationFrame(snapFrame);
      clearTimeout(resizeTimer);
      clearTimeout(markTimer);
      ro.disconnect();
      io.disconnect();
      for (const slot of slots) release(slot);
      list.remove();
      void task.destroy();
    },
  };
  return view;
}
