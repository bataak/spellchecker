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
}

export interface PdfView {
  setZoom(zoom: number): void;
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
    slots.push({ el, index: i, canvas: null, task: null, rendering: false });
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
    slot.task?.cancel();
    slot.task = null;
    if (slot.canvas) {
      slot.canvas.width = 0;
      slot.canvas.height = 0;
      slot.canvas.remove();
      slot.canvas = null;
    }
    slot.rendering = false;
  };

  const draw = async (slot: PageSlot): Promise<void> => {
    if (slot.canvas || slot.rendering) return;
    slot.rendering = true;
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
      slot.task = null;
      if (!slot.rendering) return;
      slot.el.replaceChildren(canvas);
      slot.canvas = canvas;
      snap(slot);
      page.cleanup();
    } catch {
    } finally {
      slot.rendering = false;
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slot = slots[Number(entry.target.getAttribute("data-page")) - 1];
        if (!slot) continue;
        if (entry.isIntersecting) void draw(slot);
        else release(slot);
      }
    },
    { root: host, rootMargin: ROOT_MARGIN },
  );
  for (const slot of slots) io.observe(slot.el);

  let resizeTimer = 0;
  const redraw = (delay: number): void => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      for (const slot of slots) {
        if (!slot.canvas) continue;
        release(slot);
        void draw(slot);
      }
    }, delay);
  };
  const ro = new ResizeObserver(() => redraw(200));
  ro.observe(host);

  const onAbort = (): void => view.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const view: PdfView = {
    setZoom(next) {
      if (next === zoom) return;
      const midX = (host.scrollLeft + host.clientWidth / 2) / host.scrollWidth;
      const midY = (host.scrollTop + host.clientHeight / 2) / host.scrollHeight;
      zoom = next;
      list.style.setProperty("--pdf-zoom", String(zoom));
      host.scrollLeft = midX * host.scrollWidth - host.clientWidth / 2;
      host.scrollTop = midY * host.scrollHeight - host.clientHeight / 2;
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
