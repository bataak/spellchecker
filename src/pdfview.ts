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
  setZoom(zoom: number, origin?: { x: number; y: number }): void;
  destroy(): void;
}

export async function renderPdfInto(
  host: HTMLElement,
  file: File,
  signal?: AbortSignal,
  zoom = 1,
): Promise<PdfView> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

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
    slot.canvas.style.transform =
      dx || dy ? `translate(${dx}px, ${dy}px)` : "";
  };

  let snapFrame = 0;
  const onScroll = (): void => {
    if (snapFrame) return;
    snapFrame = requestAnimationFrame(() => {
      snapFrame = 0;
      for (const slot of slots) snap(slot);
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
      const pixels = Math.round(width * dpr);
      const viewport = page.getViewport({ scale: pixels / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = pixels;
      canvas.height = Math.round(viewport.height);
      canvas.style.width = canvas.width / dpr + "px";
      canvas.style.height = canvas.height / dpr + "px";
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

  const onAbort = (): void => view.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const view: PdfView = {
    setZoom(next, origin) {
      if (next === zoom) return;
      const frame = host.getBoundingClientRect();
      const x = origin?.x ?? frame.left + host.clientLeft + host.clientWidth / 2;
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
      ro.disconnect();
      io.disconnect();
      for (const slot of slots) release(slot);
      list.remove();
      void task.destroy();
    },
  };
  return view;
}
