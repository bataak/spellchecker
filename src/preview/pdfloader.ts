export type PdfLoadingTask = ReturnType<
  (typeof import("pdfjs-dist"))["getDocument"]
>;

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

export function dropWorker(): void {
  sharedWorker?.destroy();
  sharedWorker = null;
}

export async function pdfLoader(): Promise<
  (data: Uint8Array) => PdfLoadingTask
> {
  const pdfjs = await loadPdfjs();
  return (data) => pdfjs.getDocument({ data, worker: pdfWorker(pdfjs) });
}
