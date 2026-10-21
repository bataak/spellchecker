import { escapeAttr } from "../core/htmlutil.ts";
import type { ExportFormat } from "./exportformats.ts";

export interface ExportParts {
  readonly overlay: HTMLElement;
  readonly nameInput: HTMLInputElement;
  readonly tocField: HTMLElement;
  readonly tocInput: HTMLInputElement;
  readonly notesField: HTMLElement;
  readonly notesInput: HTMLInputElement;
  readonly missingField: HTMLElement;
  readonly missingList: HTMLElement;
  readonly errorNote: HTMLElement;
}

function formatButtons(formats: readonly ExportFormat[]): string {
  return formats
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
    .join("");
}

export function missingItems(missing: readonly string[]): string {
  return missing
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

export function buildExportDialog(
  formats: readonly ExportFormat[],
): ExportParts {
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
    formatButtons(formats) +
    "</div>" +
    '<label class="export-toc" hidden>' +
    '<input class="export-toc-input" type="checkbox" /> Гарчгийн жагсаалт үүсгэх' +
    "</label>" +
    '<div class="export-missing" hidden>' +
    '<p class="export-missing-title">Олдоогүй зураг — файлд орохгүй:</p>' +
    '<ul class="export-missing-list"></ul>' +
    "</div>" +
    '<label class="export-toc export-notes" hidden>' +
    '<input class="export-notes-input" type="checkbox" /> Илтгэгчийн тэмдэглэлийг хоёр дахь дэлгэцэд гаргах' +
    "</label>" +
    '<p class="export-error" role="alert" hidden></p>' +
    '<div class="export-actions">' +
    '<button type="button" class="tbtn export-cancel">Болих</button>' +
    '<button type="button" class="tbtn export-confirm">Хадгалах</button>' +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);
  const find = <T extends HTMLElement>(selector: string): T =>
    overlay.querySelector<T>(selector)!;
  return {
    overlay,
    nameInput: find<HTMLInputElement>(".export-name"),
    tocField: find(".export-toc"),
    tocInput: find<HTMLInputElement>(".export-toc-input"),
    notesField: find(".export-notes"),
    notesInput: find<HTMLInputElement>(".export-notes-input"),
    missingField: find(".export-missing"),
    missingList: find(".export-missing-list"),
    errorNote: find(".export-error"),
  };
}
