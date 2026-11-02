import type { Html } from "../core/htmlutil.ts";
import { flash } from "../ui/clipboard.ts";
import { deliverFile } from "./export.ts";
import { escapeHtml, trustedHtml, html, joinHtml } from "../core/htmlutil.ts";
import type { CompiledPdf } from "../preview/pdfcache.ts";

const PREPARING = "PDF бэлтгэж байна…";

export function setSaveBusy(
  button: HTMLElement | null,
  busy: boolean,
  text = PREPARING,
): void {
  if (!button) return;
  if (busy) {
    button.dataset.label ||= button.textContent ?? "";
    button.textContent = text;
  } else {
    button.textContent = button.dataset.label ?? "";
  }
  button.toggleAttribute("aria-busy", busy);
}

export function missingNote(prefix: Html, missing: readonly string[]): Html {
  return trustedHtml(prefix + escapeHtml(missing.join(", ")));
}

export interface PdfSaverDeps {
  readonly name: () => string;
  readonly saveProject: () => Promise<unknown> | undefined;
  readonly notify: (markup: Html) => void;
  readonly button: HTMLElement | null;
}

export function createPdfSaver(
  deps: PdfSaverDeps,
): (compile: () => Promise<CompiledPdf>) => Promise<void> {
  let saving = false;
  return async (compile) => {
    if (saving) return;
    saving = true;
    setSaveBusy(deps.button, true);
    const notes: Html[] = [];
    try {
      const name = deps.name();
      const compiled = compile();
      compiled.catch(() => {});
      const saved = await deps.saveProject()?.then(
        () => true,
        () => false,
      );
      if (saved === false)
        notes.push(html`Төслийн файлуудыг хадгалж чадсангүй`);
      const { pdf, missing } = await compiled;
      setSaveBusy(deps.button, false);
      if (missing.length)
        notes.push(missingNote(html`PDF-д ороогүй зураг: `, missing));
      if (notes.length) deps.notify(joinHtml(notes, html` · `));
      if (await deliverFile(pdf, name, "application/pdf"))
        flash(deps.button, "PDF хадгаллаа");
    } catch (error) {
      setSaveBusy(deps.button, false);
      flash(deps.button, "PDF гаргаж чадсангүй");
      if (error instanceof Error && error.name === "PdfError")
        notes.push(escapeHtml(error.message));
      if (notes.length) deps.notify(joinHtml(notes, html` · `));
    } finally {
      saving = false;
    }
  };
}
