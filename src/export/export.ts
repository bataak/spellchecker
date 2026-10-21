import { onImagesChange, pickImage, putImage } from "../files/images.ts";
import { downloadBlob } from "../files/download.ts";
import type { SaveChain } from "../ui/savechain.ts";
import { createPrinter } from "./exportprint.ts";
import {
  FORMATS,
  stripExt,
  EMBED_FORMATS,
  NOTES_FORMATS,
  TOC_FORMATS,
  withExt,
  hasNotes,
  missingImages,
  hasSections,
  type ExportFormat,
} from "./exportformats.ts";
import { findTemplate } from "../doc/templates.ts";
import type { TexProject } from "../project/projectbuild.ts";
import { buildExportDialog, missingItems } from "./exportmarkup.ts";
import { bindExportTriggers } from "./exporttriggers.ts";

export interface ExportOptions {
  readonly editor: HTMLTextAreaElement;
  readonly baseName: () => string | null;
  readonly blocked?: () => boolean;
  readonly isTex?: () => boolean;
  readonly texProject?: () => TexProject | null;
  readonly texZip?: (text: string, name: string) => Promise<Blob>;
  readonly texZipped?: () => void;
  readonly texPdf?: () => Promise<Uint8Array<ArrayBuffer>>;
  readonly texSource?: (name: string) => Promise<void>;
  readonly saveButton?: HTMLElement | null;
  readonly saveChain?: SaveChain;
  readonly printButton?: HTMLElement | null;
  readonly template: () => string;
  readonly onDone?: (name: string) => void;
  readonly onBlocked?: () => void;
  readonly onPrintError?: (error: unknown) => void;
  readonly onBusy?: (busy: boolean, ext?: string) => void;
}

export interface ExportControl {
  open: () => void;
  syncPrint: () => void;
  destroy: () => void;
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    String(now.getFullYear()) +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes())
  );
}

export async function deliverFile(
  data: BlobPart,
  name: string,
  mime: string,
): Promise<boolean> {
  const blob = new Blob([data], { type: mime });

  if (typeof navigator.canShare === "function") {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return false;
      }
    }
  }

  downloadBlob(blob, name);
  return true;
}

function texFormatsFor(options: ExportOptions): ExportFormat[] {
  const formats: ExportFormat[] = [
    {
      id: "tex-source",
      frames: [],
      preferred: true,
      name: "LaTeX эх",
      ext: "tex",
      mime: "application/x-tex;charset=utf-8",
      save: options.texSource,
      build: (text) => text,
    },
  ];
  const { texPdf, texZip } = options;
  if (texPdf)
    formats.push({
      id: "tex-pdf",
      frames: [],
      name: "PDF",
      ext: "pdf",
      mime: "application/pdf",
      slow: true,
      build: () => texPdf(),
    });
  if (texZip)
    formats.push({
      id: "tex-zip",
      frames: [],
      name: "Архив",
      ext: "zip",
      mime: "application/zip",
      slow: true,
      delivered: options.texZipped,
      build: (text, _template, { name }) => texZip(text, name ?? "main"),
    });
  return formats;
}

function bindMissingPick(list: HTMLElement): void {
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>(
      ".export-pick",
    );
    const src = button?.dataset.src;
    if (!src) return;
    void pickImage().then((file) => {
      if (file) putImage(src, file);
    });
  });
}

const formatButtons = (overlay: HTMLElement) =>
  overlay.querySelectorAll<HTMLElement>(".export-format");

async function produce(
  options: ExportOptions,
  format: ExportFormat,
  text: string,
  name: string,
  flags: { toc: boolean; notesScreen: boolean },
): Promise<string | null> {
  if (format.slow) options.onBusy?.(true, format.ext);
  try {
    const data = await format.build(text, options.template(), {
      ...flags,
      name: stripExt(name),
    });
    if (format.slow) options.onBusy?.(false);
    if (await deliverFile(data, name, format.mime)) {
      format.delivered?.();
      options.onDone?.(name);
    }
  } catch (error) {
    if (format.slow) options.onBusy?.(false);
    console.error("export:", error);
    if (error instanceof Error && error.name === "PdfError")
      return error.message;
    options.onBlocked?.();
  }
  return null;
}

export function initExport(options: ExportOptions): ExportControl {
  const { editor } = options;
  const texFormats = texFormatsFor(options);
  const formats = [...FORMATS, ...texFormats];
  const parts = buildExportDialog(formats);
  const { overlay, nameInput, tocInput, notesInput, errorNote } = parts;

  let chosen = FORMATS[0]!;
  let userPicked = false;
  let restoreFocus: HTMLElement | null = null;

  const baseFrom = (): string => {
    const current = options.baseName();
    return current ? stripExt(current) : stamp();
  };

  function available(): ExportFormat[] {
    if (options.isTex?.()) return texFormats;
    const frame = findTemplate(options.template())?.frame ?? "plain";
    return FORMATS.filter((format) => format.frames.includes(frame));
  }

  function syncMissing(): void {
    const missing =
      options.isTex?.() || !EMBED_FORMATS.has(chosen.id)
        ? []
        : missingImages(editor.value);
    parts.missingField.hidden = missing.length === 0;
    parts.missingList.innerHTML = missingItems(missing);
  }

  function syncFormat(): void {
    for (const button of formatButtons(overlay))
      button.classList.toggle("is-on", button.dataset.format === chosen.id);
    const template = options.template();
    parts.tocField.hidden =
      !TOC_FORMATS.has(chosen.id) || !hasSections(editor.value, template);
    parts.notesField.hidden =
      !NOTES_FORMATS.has(chosen.id) || !hasNotes(editor.value, template);
    syncMissing();
    nameInput.value = stripExt(nameInput.value) + "." + chosen.ext;
  }

  bindMissingPick(parts.missingList);
  onImagesChange(() => {
    if (!overlay.hidden) syncMissing();
  });

  function open(): void {
    if (options.blocked?.()) {
      options.onBlocked?.();
      return;
    }
    restoreFocus = document.activeElement as HTMLElement | null;
    errorNote.hidden = true;
    tocInput.checked = false;
    notesInput.checked = false;
    const offered = available();
    if (!userPicked || !offered.includes(chosen))
      chosen =
        offered.find((item) => item.preferred) ?? offered[0] ?? FORMATS[0]!;
    const ids = new Set(offered.map((item) => item.id));
    for (const button of formatButtons(overlay))
      button.hidden = !ids.has(button.dataset.format ?? "");
    nameInput.value = baseFrom();
    syncFormat();
    overlay.hidden = false;
    nameInput.focus();
    nameInput.setSelectionRange(
      0,
      nameInput.value.length - chosen.ext.length - 1,
    );
  }

  function close(): void {
    if (overlay.hidden) return;
    overlay.hidden = true;
    restoreFocus?.focus();
    restoreFocus = null;
  }

  async function run(): Promise<void> {
    const text = editor.value;
    const name = withExt(nameInput.value.trim() || baseFrom(), chosen.ext);
    close();
    const format = chosen;
    if (format.save) {
      await format.save(name);
      return;
    }
    const failed = await produce(options, format, text, name, {
      toc: tocInput.checked,
      notesScreen: notesInput.checked,
    });
    if (failed !== null) showError(format, name, failed);
  }

  function showError(
    format: ExportFormat,
    name: string,
    message: string,
  ): void {
    open();
    if (overlay.hidden) return;
    if (!available().includes(format)) {
      close();
      options.onBlocked?.();
      return;
    }
    chosen = format;
    syncFormat();
    nameInput.value = name;
    errorNote.textContent = message;
    errorNote.hidden = false;
  }

  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target === overlay || target?.closest(".export-cancel")) {
      close();
      return;
    }
    const picked = target?.closest<HTMLElement>(".export-format");
    const found = formats.find((item) => item.id === picked?.dataset.format);
    if (picked) {
      if (found) {
        chosen = found;
        userPicked = true;
        syncFormat();
      }
      return;
    }
    if (target?.closest(".export-confirm")) void run();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && event.target === nameInput) {
      event.preventDefault();
      void run();
    }
  });

  const triggers = bindExportTriggers({
    open,
    printer: createPrinter(options),
    saveButton: options.saveButton,
    printButton: options.printButton,
    saveChain: options.saveChain,
  });

  return {
    open,
    syncPrint: triggers.syncPrint,
    destroy(): void {
      triggers.destroy();
      overlay.remove();
    },
  };
}
