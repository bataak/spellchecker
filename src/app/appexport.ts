import type { SaveChain } from "../ui/savechain.ts";
import { flash } from "../ui/clipboard.ts";
import { initExport, type ExportControl } from "../export/export.ts";
import { isFileSlot } from "../slots/fileslots.ts";
import { escapeHtml } from "../core/htmlutil.ts";
import type { CompiledPdf } from "../preview/pdfcache.ts";
import type { ProjectLink } from "../project/projectlink.ts";
import { missingNote, setSaveBusy } from "../export/savepdf.ts";
import { PLAIN } from "../doc/templates.ts";
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
  readonly saveChain: SaveChain;
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
  const saveButton = document.querySelector<HTMLElement>("#saveBtn");
  const printButton = document.querySelector<HTMLElement>("#printBtn");
  return initExport({
    editor: deps.editor,
    saveButton,
    saveChain: deps.saveChain,
    printButton,
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
    onDone: () => flash(saveButton, "Хадгаллаа"),
    onBlocked: () => flash(saveButton, "Экспорт хийх боломжгүй"),
    onEmpty: () => flash(saveButton, "Хоосон байна"),
    onPrintError: (error) => {
      flash(printButton, "Хэвлэж чадсангүй");
      if (error instanceof Error && error.name === "PdfError")
        deps.hold(escapeHtml(error.message), NOTE_MS, false);
    },
    onBusy: (busy, ext) =>
      setSaveBusy(
        saveButton,
        busy,
        ext === "zip" ? "Архивлаж байна…" : undefined,
      ),
  });
}
