import { read, write } from "../store.ts";

const OFFLINE_READY_MS = 6000;

export function warmTex(notify: (html: string, ms: number) => void): void {
  void import("../tex/texpdf.ts").then(async (mod) => {
    const ready = await mod.prefetchFonts();
    if (!ready || !navigator.serviceWorker?.controller) return;
    if (read(mod.OFFLINE_KEY) || !write(mod.OFFLINE_KEY, "1")) return;
    notify("LaTeX файлтай офлайн ажиллахад бэлэн боллоо", OFFLINE_READY_MS);
  });
  void import("../preview/pdfview.ts").then((mod) => mod.warmPdf());
  void import("../tex/teximages.ts");
  void import("../tex/latex.ts");
}
