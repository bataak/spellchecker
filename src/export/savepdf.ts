import { flash } from "../ui/clipboard.ts";
import { deliverFile } from "./export.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import type { CompiledPdf } from "../preview/pdfcache.ts";

const PREPARING = "PDF бэлтгэж байна…";

export function setSaveBusy(busy: boolean, text = PREPARING): void {
  const button = document.querySelector<HTMLElement>("#saveBtn");
  if (!button) return;
  if (busy) {
    button.dataset.label ||= button.textContent ?? "";
    button.textContent = text;
  } else {
    button.textContent = button.dataset.label ?? "";
  }
  button.toggleAttribute("aria-busy", busy);
}

export function missingNote(
  prefix: string,
  missing: readonly string[],
): string {
  return prefix + escapeHtml(missing.join(", "));
}

export interface PdfSaverDeps {
  readonly name: () => string;
  readonly saveProject: () => Promise<unknown> | undefined;
  readonly notify: (html: string) => void;
}

export function createPdfSaver(
  deps: PdfSaverDeps,
): (compile: () => Promise<CompiledPdf>) => Promise<void> {
  let saving = false;
  return async (compile) => {
    if (saving) return;
    saving = true;
    setSaveBusy(true);
    const notes: string[] = [];
    try {
      const name = deps.name();
      const compiled = compile();
      compiled.catch(() => {});
      const saved = await deps.saveProject()?.then(
        () => true,
        () => false,
      );
      if (saved === false) notes.push("Төслийн файлуудыг хадгалж чадсангүй");
      const { pdf, missing } = await compiled;
      setSaveBusy(false);
      if (missing.length)
        notes.push(missingNote("PDF-д ороогүй зураг: ", missing));
      if (notes.length) deps.notify(notes.join(" · "));
      if (await deliverFile(pdf, name, "application/pdf"))
        flash("#saveBtn", "PDF хадгаллаа");
    } catch (error) {
      setSaveBusy(false);
      flash("#saveBtn", "PDF гаргаж чадсангүй");
      if (error instanceof Error && error.name === "PdfError")
        notes.push(escapeHtml(error.message));
      if (notes.length) deps.notify(notes.join(" · "));
    } finally {
      saving = false;
    }
  };
}
