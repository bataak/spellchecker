import { html } from "../core/htmlutil.ts";
import type { Html } from "../core/htmlutil.ts";
import { read, write } from "../core/store.ts";

const OFFLINE_READY_MS = 6000;

export function warmTex(notify: (markup: Html, ms: number) => void): void {
  void import("../tex/texassets.ts").then(async (mod) => {
    const ready = await mod.prefetchFonts();
    if (!ready || !navigator.serviceWorker?.controller) return;
    if (read(mod.OFFLINE_KEY) || !write(mod.OFFLINE_KEY, "1")) return;
    notify(html`LaTeX файлтай офлайн ажиллахад бэлэн боллоо`, OFFLINE_READY_MS);
  });
  void import("../preview/pdfview.ts").then((mod) => mod.warmPdf());
  void import("../tex/latex.ts");
}
