import { onImagesChange, pickImage, putImage } from "../files/images.ts";
import { downloadBlob } from "../files/download.ts";
import type { SaveChain, SaveTrigger } from "../ui/savechain.ts";
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
import { escapeAttr } from "../core/htmlutil.ts";
import { findTemplate } from "../doc/templates.ts";
import type { TexProject } from "../project/projectbuild.ts";

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

const LONG_PRESS_MS = 550;

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

export function initExport(options: ExportOptions): ExportControl {
  const { editor } = options;

  const texFormats: ExportFormat[] = [
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
  const { texPdf } = options;
  if (texPdf)
    texFormats.push({
      id: "tex-pdf",
      frames: [],
      name: "PDF",
      ext: "pdf",
      mime: "application/pdf",
      slow: true,
      build: () => texPdf(),
    });
  const { texZip } = options;
  if (texZip)
    texFormats.push({
      id: "tex-zip",
      frames: [],
      name: "Архив",
      ext: "zip",
      mime: "application/zip",
      slow: true,
      delivered: options.texZipped,
      build: (text, _template, { name }) => texZip(text, name ?? "main"),
    });
  const formats = [...FORMATS, ...texFormats];

  const overlay = document.createElement("div");
  overlay.className = "export-backdrop";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="export-panel" role="dialog" aria-modal="true" ' +
    'aria-label="Файл болгож хадгалах">' +
    '<h2 class="export-title">Файл болгож хадгалах</h2>' +
    '<label class="export-field">Нэр' +
    '<input class="export-name" type="text" autocomplete="off" ' +
    'autocapitalize="off" spellcheck="false" />' +
    "</label>" +
    '<div class="export-formats">' +
    formats
      .map(
        (format, index) =>
          '<button type="button" class="tbtn export-format' +
          (index === 0 ? " is-on" : "") +
          '" data-format="' +
          escapeAttr(format.id) +
          '">' +
          escapeAttr(format.name) +
          ' <span class="export-ext">.' +
          escapeAttr(format.ext) +
          "</span></button>",
      )
      .join("") +
    "</div>" +
    '<label class="export-toc" hidden>' +
    '<input class="export-toc-input" type="checkbox" /> Гарчгийн жагсаалт үүсгэх' +
    "</label>" +
    '<div class="export-missing" hidden>' +
    '<p class="export-missing-title">Олдоогүй зураг — файлд орохгүй:</p>' +
    '<ul class="export-missing-list"></ul>' +
    "</div>" +
    '<label class="export-toc export-notes" hidden>' +
    '<input class="export-notes-input" type="checkbox" /> Илтгэгчийн тэмдэглэлийг хоёр дахь дэлгэцэнд гаргах' +
    "</label>" +
    '<p class="export-error" role="alert" hidden></p>' +
    '<div class="export-actions">' +
    '<button type="button" class="tbtn export-cancel">Болих</button>' +
    '<button type="button" class="tbtn export-confirm">Хадгалах</button>' +
    "</div>" +
    "</div>";

  document.body.appendChild(overlay);

  const nameInput = overlay.querySelector<HTMLInputElement>(".export-name")!;
  const tocField = overlay.querySelector<HTMLElement>(".export-toc")!;
  const tocInput =
    overlay.querySelector<HTMLInputElement>(".export-toc-input")!;
  const notesField = overlay.querySelector<HTMLElement>(".export-notes")!;
  const missingField = overlay.querySelector<HTMLElement>(".export-missing")!;
  const missingList = overlay.querySelector<HTMLElement>(
    ".export-missing-list",
  )!;
  const notesInput = overlay.querySelector<HTMLInputElement>(
    ".export-notes-input",
  )!;
  const errorNote = overlay.querySelector<HTMLElement>(".export-error")!;

  let chosen = FORMATS[0]!;
  let userPicked = false;
  let restoreFocus: HTMLElement | null = null;

  function baseFrom(): string {
    const current = options.baseName();
    if (current) return stripExt(current);
    return stamp();
  }

  function available(): ExportFormat[] {
    if (options.isTex?.()) return texFormats;
    const frame = findTemplate(options.template())?.frame ?? "plain";
    return FORMATS.filter((format) => format.frames.includes(frame));
  }

  function syncFormat(): void {
    for (const button of overlay.querySelectorAll<HTMLElement>(
      ".export-format",
    ))
      button.classList.toggle("is-on", button.dataset.format === chosen.id);

    tocField.hidden =
      !TOC_FORMATS.has(chosen.id) ||
      !hasSections(editor.value, options.template());
    notesField.hidden =
      !NOTES_FORMATS.has(chosen.id) ||
      !hasNotes(editor.value, options.template());
    syncMissing();

    nameInput.value = stripExt(nameInput.value) + "." + chosen.ext;
  }

  function syncMissing(): void {
    const missing =
      options.isTex?.() || !EMBED_FORMATS.has(chosen.id)
        ? []
        : missingImages(editor.value);
    missingField.hidden = missing.length === 0;
    missingList.innerHTML = missing
      .map(
        (src) =>
          '<li><span class="export-missing-name">' +
          escapeAttr(src) +
          '</span><button type="button" class="tbtn export-pick" data-src="' +
          escapeAttr(src) +
          '">Сонгох</button></li>',
      )
      .join("");
  }

  missingList.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>(
      ".export-pick",
    );
    const src = button?.dataset.src;
    if (!src) return;
    void pickImage().then((file) => {
      if (file) putImage(src, file);
    });
  });
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
    for (const button of overlay.querySelectorAll<HTMLElement>(
      ".export-format",
    ))
      button.hidden = !offered.some(
        (item) => item.id === button.dataset.format,
      );
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
    let name = nameInput.value.trim() || baseFrom();
    name = withExt(name, chosen.ext);

    close();
    const format = chosen;
    if (format.save) {
      await format.save(name);
      return;
    }
    if (format.slow) options.onBusy?.(true, format.ext);
    try {
      const data = await format.build(text, options.template(), {
        toc: tocInput.checked,
        notesScreen: notesInput.checked,
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
      if (error instanceof Error && error.name === "PdfError") {
        showError(format, name, error.message);
        return;
      }
      options.onBlocked?.();
    }
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

  const onOverlayClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target === overlay || target?.closest(".export-cancel")) {
      close();
      return;
    }
    const picked = target?.closest<HTMLElement>(".export-format");
    if (picked) {
      const found = formats.find((item) => item.id === picked.dataset.format);
      if (found) {
        chosen = found;
        userPicked = true;
        syncFormat();
      }
      return;
    }
    if (target?.closest(".export-confirm")) void run();
  };

  const onOverlayKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && event.target === nameInput) {
      event.preventDefault();
      void run();
    }
  };

  const printer = createPrinter(options);

  const printButton = options.printButton;

  function syncPrint(): void {
    if (printButton) printButton.hidden = !printer.printable();
  }

  const onPrintClick = (): void => {
    if (printer.printable()) printer.start();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyP" || event.key.toLowerCase() === "p") &&
      printer.printable()
    ) {
      event.preventDefault();
      printer.start();
      return;
    }
    if (!event.altKey || !(event.ctrlKey || event.metaKey)) return;
    if (event.code !== "KeyS" && event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    open();
  };

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let held = false;

  const cancelPress = (): void => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  const dropPress = (event: PointerEvent): void => {
    cancelPress();
    if (event.type === "pointercancel" || event.buttons) held = false;
  };

  const onPressStart = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    held = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      held = true;
      open();
    }, LONG_PRESS_MS);
  };

  const interceptSave = ({ shift }: SaveTrigger): boolean => {
    if (!held && !shift) return false;
    if (!held) open();
    held = false;
    return true;
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  overlay.addEventListener("click", onOverlayClick);
  overlay.addEventListener("keydown", onOverlayKey);
  document.addEventListener("keydown", onKeyDown);

  printButton?.addEventListener("click", onPrintClick);
  syncPrint();

  const saveButton = options.saveButton;
  if (saveButton) {
    saveButton.addEventListener("pointerdown", onPressStart);
    saveButton.addEventListener("pointerup", cancelPress);
    saveButton.addEventListener("pointerleave", dropPress);
    saveButton.addEventListener("pointercancel", dropPress);
    saveButton.addEventListener("contextmenu", onContextMenu);
  }
  const releaseSave = options.saveChain?.intercept(interceptSave);

  return {
    open,
    syncPrint,
    destroy(): void {
      cancelPress();
      printButton?.removeEventListener("click", onPrintClick);
      document.removeEventListener("keydown", onKeyDown);
      if (saveButton) {
        saveButton.removeEventListener("pointerdown", onPressStart);
        saveButton.removeEventListener("pointerup", cancelPress);
        saveButton.removeEventListener("pointerleave", dropPress);
        saveButton.removeEventListener("pointercancel", dropPress);
        saveButton.removeEventListener("contextmenu", onContextMenu);
      }
      releaseSave?.();
      overlay.remove();
    },
  };
}
