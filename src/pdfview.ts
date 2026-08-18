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
  destroy(): void;
}

export async function renderPdfInto(
  host: HTMLElement,
  file: File,
  signal?: AbortSignal,
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
  host.replaceChildren(list);

  const slots: PageSlot[] = [];
  const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);

  const widthOf = (): number => Math.max(host.clientWidth - 24, 120);

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
      const width = widthOf();
      const scale = width / base.width;
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const render = page.render({ canvas, canvasContext: ctx, viewport });
      slot.task = render;
      await render.promise;
      slot.task = null;
      if (!slot.rendering) return;
      slot.el.replaceChildren(canvas);
      slot.canvas = canvas;
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
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      for (const slot of slots) {
        if (!slot.canvas) continue;
        release(slot);
        void draw(slot);
      }
    }, 200);
  });
  ro.observe(host);

  const onAbort = (): void => view.destroy();
  signal?.addEventListener("abort", onAbort, { once: true });

  const view: PdfView = {
    destroy() {
      signal?.removeEventListener("abort", onAbort);
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
