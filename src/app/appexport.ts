import { flash } from "../clipboard.ts";
import { initExport, type ExportControl } from "../export.ts";
import { isFileSlot } from "../fileslots.ts";
import { escapeHtml } from "../htmlutil.ts";
import type { CompiledPdf } from "../preview/pdfcache.ts";
import type { ProjectLink } from "../project/projectlink.ts";
import { missingNote, setSaveBusy } from "../savepdf.ts";
import { PLAIN } from "../templates.ts";
import { zipTexText } from "../tex/texzip.ts";

const NOTE_MS = 8000;

export interface AppExportDeps {
  readonly editor: HTMLTextAreaElement;
  readonly templateId: () => string;
  readonly isMarkdownFile: () => boolean;
  readonly isTex: () => boolean;
  readonly baseName: () => string | null;
  readonly blocked: () => boolean;
  readonly project: () => ProjectLink;
  readonly pdf: () => Promise<CompiledPdf>;
  readonly saveSource: (name: string, inProject: boolean) => Promise<void>;
  readonly hold: (html: string, ms?: number, animate?: boolean) => void;
}

export function initAppExport(deps: AppExportDeps): ExportControl {
  const note = (prefix: string, missing: readonly string[]): void => {
    if (missing.length) deps.hold(missingNote(prefix, missing), NOTE_MS, false);
  };
  const template = (): string => {
    if (deps.isTex()) return PLAIN;
    const id = deps.templateId();
    if (!isFileSlot(id)) return id;
    return deps.isMarkdownFile() ? "report" : PLAIN;
  };
  return initExport({
    editor: deps.editor,
    saveButton: document.querySelector<HTMLElement>("#saveBtn"),
    printButton: document.querySelector<HTMLElement>("#printBtn"),
    template,
    baseName: deps.baseName,
    blocked: deps.blocked,
    isTex: deps.isTex,
    texProject: () => deps.project().texProject(),
    texZip: async (text, name) => {
      if (deps.project().bound()) return deps.project().zip();
      const { blob, missing } = await zipTexText(text, name);
      note("Архивт ороогүй зураг: ", missing);
      return blob;
    },
    texZipped: () => deps.project().zipped(),
    texPdf: async () => {
      const { pdf, missing } = await deps.pdf();
      note("PDF-д ороогүй зураг: ", missing);
      return pdf;
    },
    texSource: (name) => deps.saveSource(name, deps.project().bound()),
    onDone: () => flash("#saveBtn", "Хадгаллаа"),
    onBlocked: () => flash("#saveBtn", "Экспорт хийх боломжгүй"),
    onPrintError: (error) => {
      flash("#printBtn", "Хэвлэж чадсангүй");
      if (error instanceof Error && error.name === "PdfError")
        deps.hold(escapeHtml(error.message), NOTE_MS, false);
    },
    onBusy: (busy, ext) =>
      setSaveBusy(busy, ext === "zip" ? "Архивлаж байна…" : undefined),
  });
}
