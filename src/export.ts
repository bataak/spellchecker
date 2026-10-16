import { imageFiles, prepareImages } from "./images.ts";
import { blockImages, parse } from "./markdown.ts";
import { docImages, imageKey } from "./office/docir.ts";
import { findTemplate, type Frame } from "./templates.ts";

export interface ExportFormat {
  readonly id: string;
  readonly frames: readonly Frame[];
  readonly preferred?: boolean;
  readonly name: string;
  readonly ext: string;
  readonly mime: string;
  readonly slow?: boolean;
  readonly delivered?: () => void;
  readonly save?: (name: string) => Promise<void>;
  readonly build: (
    text: string,
    templateId: string,
    options: BuildOptions,
  ) => BlobPart | Promise<BlobPart>;
}

export interface BuildOptions {
  readonly toc: boolean;
  readonly name?: string;
}

const TOC_FRAMES: ReadonlySet<Frame> = new Set(["letter", "structured"]);

const PRINT_FRAMES: ReadonlySet<Frame> = new Set([
  "letter",
  "structured",
  "slides",
]);

const TOC_FORMATS: ReadonlySet<string> = new Set([
  "odt",
  "docx",
  "tex",
  "pdf",
]);

export function hasSections(text: string, templateId: string): boolean {
  const frame = findTemplate(templateId)?.frame;
  if (frame === undefined || !TOC_FRAMES.has(frame)) return false;
  const headings = parse(text).filter((block) => block.type === "heading");
  return headings.length > 1;
}

function tocFor(
  options: BuildOptions,
  templateId: string,
  text: string,
): boolean {
  return options.toc && hasSections(text, templateId);
}

async function latexFor(
  text: string,
  templateId: string,
  options: BuildOptions,
): Promise<string> {
  const [{ toBeamer, toLatex }, { dropControls }] = await Promise.all([
    import("./latex.ts"),
    import("./office/sanitize.ts"),
  ]);
  const frame = findTemplate(templateId)?.frame;
  const blocks = parse(dropControls(text));
  return frame === "slides"
    ? toBeamer(blocks)
    : toLatex(blocks, undefined, {
        toc: tocFor(options, templateId, text),
        pageNumbers: frame !== "letter" || hasSections(text, templateId),
        letter: frame === "letter",
      });
}

async function pdfImages(
  text: string,
  source: string,
  texImagePath: (src: string) => string,
): Promise<{ tex: string; files: Record<string, Uint8Array> }> {
  const sources = [...new Set(blockImages(parse(text)).map((n) => n.src))];
  const ready = await imageFiles(sources.map((src) => ({ src })));
  const names = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  for (const src of sources) {
    const file = ready.get(imageKey({ src }));
    if (!file) continue;
    const name =
      "image" +
      String(names.size + 1) +
      (file.ext === "jpeg" ? ".jpg" : ".png");
    names.set(texImagePath(src), name);
    files[name] = file.bytes;
  }
  const tex = source.replace(
    /\\includegraphics\[([^\]]*)\]\{([^}]*)\}/g,
    (_, opts: string, path: string) => {
      const name = names.get(path);
      return name ? "\\includegraphics[" + opts + "]{" + name + "}" : "";
    },
  );
  return { tex, files };
}

export const FORMATS: readonly ExportFormat[] = [
  {
    id: "odt",
    frames: ["letter", "structured"],
    name: "OpenDocument",
    ext: "odt",
    mime: "application/vnd.oasis.opendocument.text",
    build: async (text, templateId, options) => {
      const [{ parse }, { applyTemplate }, { buildOdt }] = await Promise.all([
        import("./markdown.ts"),
        import("./office/apply.ts"),
        import("./office/odt/create.ts"),
      ]);
      const template = findTemplate(templateId) ?? findTemplate("plain")!;
      const doc = applyTemplate(parse(text), template);
      return buildOdt(doc, {
        toc: tocFor(options, templateId, text),
        images: await imageFiles(docImages(doc)),
      });
    },
  },
  {
    id: "docx",
    frames: ["letter", "structured"],
    preferred: true,
    name: "Word",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    build: async (text, templateId, options) => {
      const [{ parse }, { applyTemplate }, { buildDocx }] = await Promise.all(
        [
          import("./markdown.ts"),
          import("./office/apply.ts"),
          import("./office/docx/create.ts"),
        ],
      );
      const template = findTemplate(templateId) ?? findTemplate("plain")!;
      const doc = applyTemplate(parse(text), template);
      return buildDocx(doc, {
        toc: tocFor(options, templateId, text),
        images: await imageFiles(docImages(doc)),
      });
    },
  },
  {
    id: "pdf",
    frames: ["letter", "structured", "slides"],
    name: "PDF",
    ext: "pdf",
    mime: "application/pdf",
    slow: true,
    build: async (text, templateId, options) => {
      const [source, { compilePdf }, { texImagePath }] = await Promise.all([
        latexFor(text, templateId, options),
        import("./texpdf.ts"),
        import("./latex.ts"),
      ]);
      const { tex, files } = await pdfImages(text, source, texImagePath);
      return compilePdf(tex, tocFor(options, templateId, text) ? 2 : 1, files);
    },
  },
  {
    id: "odp",
    frames: ["slides"],
    name: "OpenDocument",
    ext: "odp",
    mime: "application/vnd.oasis.opendocument.presentation",
    build: async (text) => {
      const [
        { parse },
        { splitSlides },
        { deckDoc, deckImages },
        { buildOdp },
      ] = await Promise.all([
        import("./markdown.ts"),
        import("./slides.ts"),
        import("./office/deck.ts"),
        import("./office/odp/create.ts"),
      ]);
      const deck = deckDoc(splitSlides(parse(text)));
      return buildOdp(deck, { images: await imageFiles(deckImages(deck)) });
    },
  },
  {
    id: "pptx",
    frames: ["slides"],
    preferred: true,
    name: "PowerPoint",
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    build: async (text) => {
      const [
        { parse },
        { splitSlides },
        { deckDoc, deckImages },
        { buildPptx },
      ] = await Promise.all([
        import("./markdown.ts"),
        import("./slides.ts"),
        import("./office/deck.ts"),
        import("./office/pptx/create.ts"),
      ]);
      const deck = deckDoc(splitSlides(parse(text)));
      return buildPptx(deck, { images: await imageFiles(deckImages(deck)) });
    },
  },
  {
    id: "tex",
    frames: ["letter", "structured", "slides"],
    name: "LaTeX",
    ext: "tex",
    mime: "application/x-tex;charset=utf-8",
    build: latexFor,
  },
  {
    id: "md",
    frames: ["letter", "structured", "slides"],
    name: "Markdown",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    build: (text) => text,
  },
  {
    id: "md-plain",
    frames: ["letter", "structured", "slides"],
    name: "Markdown (цэвэр)",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    build: async (text) => (await import("./markdown.ts")).withoutDivs(text),
  },
  {
    id: "txt",
    frames: ["plain"],
    name: "Энгийн бичвэр",
    ext: "txt",
    mime: "text/plain;charset=utf-8",
    build: (text) => text,
  },
];

export interface ExportOptions {
  readonly editor: HTMLTextAreaElement;
  readonly baseName: () => string | null;
  readonly blocked?: () => boolean;
  readonly isTex?: () => boolean;
  readonly texZip?: (text: string, name: string) => Promise<Blob>;
  readonly texZipped?: () => void;
  readonly texPdf?: () => Promise<Uint8Array<ArrayBuffer>>;
  readonly texSource?: (name: string) => Promise<void>;
  readonly saveButton?: HTMLElement | null;
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
const KNOWN_EXT = new RegExp(
  "\\.(?:" +
    [
      ...new Set([
        ...FORMATS.map((format) => format.ext),
        "txt",
        "text",
        "md",
        "markdown",
        "tex",
        "ltx",
        "docx",
        "pptx",
        "odt",
        "odp",
        "pdf",
        "zip",
      ]),
    ].join("|") +
    ")$",
  "i",
);

export function stripExt(name: string): string {
  return name.replace(KNOWN_EXT, "");
}

export function withExt(name: string, ext: string): string {
  return KNOWN_EXT.test(name) ? name : name + "." + ext;
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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
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
    formats.map(
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
    ).join("") +
    "</div>" +
    '<label class="export-toc" hidden>' +
    '<input class="export-toc-input" type="checkbox" /> Гарчгийн жагсаалт үүсгэх' +
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

    nameInput.value = stripExt(nameInput.value) + "." + chosen.ext;
  }

  function open(): void {
    if (options.blocked?.()) {
      options.onBlocked?.();
      return;
    }
    restoreFocus = document.activeElement as HTMLElement | null;
    errorNote.hidden = true;
    tocInput.checked = false;
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

  async function printTex(): Promise<void> {
    options.onBusy?.(true);
    try {
      const [{ compileTex }, { printPdf }] = await Promise.all([
        import("./texpdf.ts"),
        import("./office/print.ts"),
      ]);
      await printPdf(await compileTex(editor.value));
    } finally {
      options.onBusy?.(false);
    }
  }

  async function print(): Promise<void> {
    if (options.isTex?.()) return printTex();
    const template = findTemplate(options.template())!;
    if (template.frame === "slides") {
      const [{ splitSlides }, { deckDoc, deckImages }, { printDeck }] =
        await Promise.all([
          import("./slides.ts"),
          import("./office/deck.ts"),
          import("./office/deckprint.ts"),
        ]);
      const deck = deckDoc(splitSlides(parse(editor.value)));
      await printDeck(deck, await prepareImages(deckImages(deck)));
      return;
    }
    const [{ applyTemplate }, { printDoc }] = await Promise.all([
      import("./office/apply.ts"),
      import("./office/print.ts"),
    ]);
    const doc = applyTemplate(parse(editor.value), template);
    await printDoc(doc, await prepareImages(docImages(doc)));
  }

  function printable(): boolean {
    if (options.blocked?.()) return false;
    if (options.isTex?.()) return true;
    const frame = findTemplate(options.template())?.frame;
    return frame !== undefined && PRINT_FRAMES.has(frame);
  }

  function startPrint(): void {
    print().catch((error: unknown) => {
      console.error("print:", error);
      if (options.onPrintError) options.onPrintError(error);
      else options.onBlocked?.();
    });
  }

  const printButton = options.printButton;

  function syncPrint(): void {
    if (printButton) printButton.hidden = !printable();
  }

  const onPrintClick = (): void => {
    if (printable()) startPrint();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.code === "KeyP" || event.key.toLowerCase() === "p") &&
      printable()
    ) {
      event.preventDefault();
      startPrint();
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

  const onPressStart = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    held = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      held = true;
      open();
    }, LONG_PRESS_MS);
  };

  const onSaveClick = (event: MouseEvent): void => {
    if (!held && !event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!held) open();
    held = false;
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
    saveButton.addEventListener("pointerleave", cancelPress);
    saveButton.addEventListener("pointercancel", cancelPress);
    saveButton.addEventListener("contextmenu", onContextMenu);
    saveButton.addEventListener("click", onSaveClick, true);
  }

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
        saveButton.removeEventListener("pointerleave", cancelPress);
        saveButton.removeEventListener("pointercancel", cancelPress);
        saveButton.removeEventListener("contextmenu", onContextMenu);
        saveButton.removeEventListener("click", onSaveClick, true);
      }
      overlay.remove();
    },
  };
}
