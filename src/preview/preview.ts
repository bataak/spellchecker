import { initImageEdit } from "./imageedit.ts";
import { onImagesChange } from "../files/images.ts";
import { fitBlanks, format, parse, toHtml } from "../markdown.ts";
import { applyDataStyles } from "../core/htmlutil.ts";
import { createHtmlSync } from "./htmlsync.ts";
import { handleImageClick, resolveImages } from "./mdimages.ts";
import type { CompiledPdf } from "./pdfcache.ts";
import { createPdfPane } from "./pdfpane.ts";
import { buildPreviewHead, HEAD_TEXT } from "./previewhead.ts";
import { createTexPreview } from "./texpreview.ts";
import type { TexProject } from "../project/projectbuild.ts";
import { tidyCaret, tidyTex } from "../tex/textidy.ts";

const TIDY_LIMIT = 400_000;
const TIDY_IDLE_MS = 5000;
const MD_TIDY_TITLE = "Markdown бичвэрийг жигдрүүлэх";
const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

function isSameDocument(next: string, ref: string): boolean {
  if (next === ref) return true;
  const n = Math.min(200, ref.length);
  if (n === 0) return next.length === 0;
  return next.slice(0, n) === ref.slice(0, n);
}

export type PreviewSource =
  | { kind: "pdf"; file: File }
  | { kind: "image"; file: File }
  | { kind: "office"; name: string };

export interface PreviewDeps {
  readonly wrap: HTMLElement;
  readonly area: HTMLTextAreaElement;
  readonly onFormat: (next: string, caret?: number) => void;
  readonly isLatex: (text: string) => boolean;
  readonly projectKey: () => string | null;
  readonly inProject: () => boolean;
  readonly texProject: () => TexProject | null;
  readonly pdfName: () => string;
  readonly jump: (start: number, end: number) => void;
}

export interface Preview {
  update(): void;
  setFileName(name: string | null): void;
  setMarkdownMode(on: boolean): void;
  setSource(src: PreviewSource | null): void;
  revealAt(offset: number): void;
  pdf(): Promise<CompiledPdf>;
  destroy(): void;
}

export function initPreview(deps: PreviewDeps): Preview {
  const {
    wrap,
    area,
    onFormat,
    isLatex,
    projectKey,
    inProject,
    pdfName,
    jump,
  } = deps;

  const panel = document.createElement("section");
  panel.className = "preview-panel";
  panel.setAttribute("aria-label", "Харагдац");

  const ui = buildPreviewHead(panel, {
    onZoom: (action) => pane.zoom(action),
    onGoTo: (page) => pane.goTo(page),
    canNavigate: () => pane.view() !== null,
  });
  const { head, title, compileBtn, downloadBtn } = ui;

  const body = document.createElement("div");
  body.className = "preview-body";

  const texError = document.createElement("p");
  texError.className = "preview-error";
  texError.setAttribute("role", "status");
  texError.hidden = true;

  const texMissing = document.createElement("p");
  texMissing.className = "preview-missing";
  texMissing.setAttribute("role", "status");
  texMissing.hidden = true;
  const texMissingText = document.createElement("span");
  const texFolder = document.createElement("button");
  texFolder.type = "button";
  texFolder.textContent = "Хавтас сонгох";
  texFolder.addEventListener("mousedown", (event) => event.preventDefault());
  texFolder.addEventListener("click", () => {
    void import("../tex/teximages.ts").then((mod) => mod.chooseImageFolder());
  });
  texMissing.append(texMissingText, texFolder);

  const notes = document.createElement("div");
  notes.className = "preview-notes";
  notes.append(texMissing, texError);

  panel.append(head, body, notes);
  const pane = createPdfPane(panel, body, () => ui);
  pane.syncZoom();
  const imageEdit = initImageEdit(body, area);
  const htmlSync = createHtmlSync(body, area, () => head.offsetHeight, jump);
  wrap.after(panel);

  const tidy = document.createElement("button");
  tidy.type = "button";
  tidy.className = "tidy-btn";
  tidy.textContent = "Хэлбэржүүлэх";
  tidy.title = MD_TIDY_TITLE;
  tidy.hidden = true;

  const tools = wrap.querySelector<HTMLElement>(".editor-tools");
  const anchor = tools?.querySelector<HTMLElement>(".measure-ctl") ?? null;
  if (tools) tools.insertBefore(tidy, anchor);
  else head.append(tidy);

  let raf = 0;
  let tidied: string | null = null;
  let typingTimer = 0;
  const showTidy = (): void => {
    tidy.hidden = tidied === null || typingTimer !== 0 || !!source;
  };
  const onTyping = (event: Event): void => {
    if (!event.isTrusted) return;
    if (typingTimer) clearTimeout(typingTimer);
    tidy.hidden = true;
    typingTimer = window.setTimeout(() => {
      typingTimer = 0;
      showTidy();
    }, TIDY_IDLE_MS);
  };
  let isMdFile = false;
  let markdownMode = false;
  let source: PreviewSource | null = null;
  let imageUrl: string | null = null;
  let sourceText = "";
  let shownHtml: string | null = null;
  let mathView: typeof import("./mathview.ts") | null = null;
  let syncTimer = 0;
  let syncedAt = -1;
  let pendingReveal: number | null = null;
  let sourceCache: {
    readonly text: string;
    readonly words: readonly import("../tex/texsync.ts").SourceWord[];
  } | null = null;

  const renderMarkdown = (): void => {
    const text = area.value;
    const blocks = text.trim() ? parse(text) : [];
    const html = blocks.length ? toHtml(fitBlanks(blocks)) : "";
    if (html !== shownHtml) {
      shownHtml = html;
      const next = document.createElement("div");
      next.innerHTML = html;
      applyDataStyles(next);
      resolveImages(next);
      if (next.querySelector(".math")) {
        if (mathView) mathView.renderMath(next);
        else
          void import("./mathview.ts")
            .then((mod) => {
              mathView = mod;
              mod.renderMath(body);
            })
            .catch(() => undefined);
      }
      body.replaceChildren(...next.childNodes);
      imageEdit.refresh();
    }
    body.classList.toggle("is-empty", !blocks.length);

    tidied = null;
    tidy.title = MD_TIDY_TITLE;
    const looksMd = isMdFile || markdownMode;
    if (looksMd && text.length <= TIDY_LIMIT && !isLatex(text)) {
      const next = format(text, blocks);
      if (next !== text) tidied = next;
    }
    showTidy();
  };

  const setTexMissing = (paths: readonly string[]): void => {
    texMissing.hidden = paths.length === 0;
    texFolder.hidden = projectKey() !== null;
    texMissingText.textContent = paths.length
      ? "Зураг олдсонгүй: " + paths.join(", ")
      : "";
  };

  const setTexError = (message: string | null): void => {
    texError.hidden = message === null;
    texError.textContent = message ?? "";
  };

  const previewShown = (): boolean =>
    document.documentElement.dataset.preview === "on" ||
    document.documentElement.dataset.pane === "preview";

  const sourceWordsOf = (
    text: string,
    sourceWords: (
      text: string,
    ) => readonly import("../tex/texsync.ts").SourceWord[],
  ): readonly import("../tex/texsync.ts").SourceWord[] => {
    if (sourceCache?.text !== text)
      sourceCache = { text, words: sourceWords(text) };
    return sourceCache.words;
  };

  const revealOffset = async (offset: number): Promise<boolean> => {
    if (area.dataset.layout) body.dataset.layout = area.dataset.layout;
    else delete body.dataset.layout;
    const view = pane.view();
    if (!tex.active()) {
      if (view || source || !shownHtml) return false;
      htmlSync.revealLine(area.value.slice(0, offset).split("\n").length - 1);
      return true;
    }
    if (!view) return false;
    const { locate, sourceWords } = await import("../tex/texsync.ts");
    const words = sourceWordsOf(area.value, sourceWords);
    const pdf = await view.words();
    if (view !== pane.view()) return false;
    const hit = locate(words, offset, pdf);
    if (hit) view.reveal(hit.page, hit.y);
    return true;
  };

  const syncToCaret = async (): Promise<void> => {
    if (!previewShown() || document.activeElement !== area) return;
    const caret = area.selectionStart;
    if (caret === syncedAt) return;
    syncedAt = caret;
    if (!(await revealOffset(caret))) syncedAt = -1;
  };

  const flushReveal = async (): Promise<void> => {
    const offset = pendingReveal;
    if (offset === null || !previewShown()) return;
    if ((await revealOffset(offset)) && pendingReveal === offset)
      pendingReveal = null;
  };

  function scheduleSync(): void {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void syncToCaret(), 250);
  }

  const jumpFromPdf = async (
    view: import("./pdfview.ts").PdfView,
    clientX: number,
    clientY: number,
  ): Promise<void> => {
    const point = view.pointAt(clientX, clientY);
    if (!point) return;
    const [{ locateSource, pdfWordAt, sourceWords }, pdf] = await Promise.all([
      import("../tex/texsync.ts"),
      view.words(),
    ]);
    if (view !== pane.view()) return;
    const index = pdfWordAt(pdf, point.page, point.x, point.y);
    if (index < 0) return;
    const words = sourceWordsOf(area.value, sourceWords);
    const hit = locateSource(words, pdf, index);
    if (hit) jump(hit.at, hit.at + hit.word.length);
  };

  const onJump = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const view = pane.view();
    if (tex.active() && view) {
      void jumpFromPdf(view, event.clientX, event.clientY);
      return;
    }
    if (tex.active() || view || source || !shownHtml) return;
    if ((event.target as Element | null)?.closest("img, a, button, input"))
      return;
    htmlSync.jumpFrom(event.clientX, event.clientY);
  };
  body.addEventListener("dblclick", onJump);

  const onEdit = (): void => {
    syncedAt = -1;
    pendingReveal = null;
  };

  const onSelection = (): void => {
    if (document.activeElement === area) scheduleSync();
  };
  document.addEventListener("selectionchange", onSelection);
  area.addEventListener("input", onEdit);

  const tex = createTexPreview({
    area,
    pane,
    compileBtn,
    downloadBtn,
    projectKey,
    inProject,
    texProject: deps.texProject,
    visible: previewShown,
    showNotice: (text) => showNotice(text),
    setError: setTexError,
    setMissing: setTexMissing,
    onShown: () => {
      syncedAt = -1;
      scheduleSync();
      void flushReveal();
    },
    onImagesChanged: () => update(),
  });

  compileBtn.addEventListener("click", () => tex.recompile());
  downloadBtn.addEventListener("click", () => {
    const bytes = pane.shown();
    if (!bytes) return;
    void import("../export/export.ts").then(({ deliverFile }) =>
      deliverFile(bytes, pdfName(), "application/pdf"),
    );
  });

  const setTexMode = (on: boolean): void => {
    if (!tex.setActive(on)) return;
    panel.classList.toggle("tex-mode", on);
    shownHtml = null;
    body.replaceChildren();
    panel.classList.remove("is-blank");
    panel.classList.toggle("is-pdf", on);
    tidy.hidden = true;
  };

  const tidyLatex = (): void => {
    const text = area.value;
    const next = text.length <= TIDY_LIMIT ? tidyTex(text) : text;
    tidied = next === text ? null : next;
    tidy.title = "LaTeX бичвэрийн догол мөр, хоосон мөрийг жигдрүүлэх";
    showTidy();
  };

  const update = (): void => {
    if (source) {
      if (!isSameDocument(area.value, sourceText)) setSource(null);
      return;
    }
    setTexMode(isLatex(area.value));
    if (tex.active()) {
      tex.schedule();
      tidyLatex();
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderMarkdown();
      void flushReveal();
    });
  };

  const showNotice = (text: string): void => {
    const note = document.createElement("p");
    note.className = "preview-notice";
    note.textContent = text;
    shownHtml = null;
    body.replaceChildren(note);
    body.classList.remove("is-empty");
    panel.classList.add("is-blank");
  };

  const setSource = (next: PreviewSource | null): void => {
    if (next === null && source === null) return;
    source = next;
    setTexMode(false);
    tidy.hidden = true;
    tex.drop();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;

    panel.classList.remove("is-blank");

    if (!next) {
      title.textContent = HEAD_TEXT;
      panel.classList.remove("is-pdf");
      shownHtml = null;
      body.replaceChildren();
      update();
      return;
    }

    sourceText = area.value;
    const name = next.kind === "office" ? next.name : next.file.name;
    title.textContent = `${HEAD_TEXT} · ${name}`;
    panel.classList.toggle("is-pdf", next.kind === "pdf");

    if (next.kind === "pdf") {
      body.classList.remove("is-empty");
      shownHtml = null;
      body.replaceChildren();
      void pane.render(next.file, () =>
        showNotice("PDF хуудсыг зурж чадсангүй"),
      );
      return;
    }
    if (next.kind === "image") {
      imageUrl = URL.createObjectURL(next.file);
      const image = document.createElement("img");
      image.className = "preview-image";
      image.alt = next.file.name;
      image.src = imageUrl;
      image.addEventListener("error", () =>
        showNotice("Зургийг харуулж чадсангүй"),
      );
      shownHtml = null;
      body.replaceChildren(image);
      body.classList.remove("is-empty");
      return;
    }
    showNotice("Уг файлыг үзүүлэх боломжгүй");
  };

  tidy.addEventListener("mousedown", (event) => event.preventDefault());
  tidy.addEventListener("click", () => {
    if (tidied === null) return;
    if (tex.active())
      onFormat(tidied, tidyCaret(area.value, tidied, area.selectionStart));
    else onFormat(tidied);
  });

  body.addEventListener("click", (event) =>
    handleImageClick(body, event.target as Element),
  );

  const offImages = onImagesChange(() => {
    if (source || tex.active()) return;
    shownHtml = null;
    update();
  });

  area.addEventListener("input", onTyping);
  area.addEventListener("input", update);
  update();

  const setFileName = (name: string | null): void => {
    isMdFile = MD_NAME.test(name ?? "");
    update();
  };

  const setMarkdownMode = (on: boolean): void => {
    if (on === markdownMode) return;
    markdownMode = on;
    shownHtml = null;
    update();
  };

  return {
    update,
    setFileName,
    setMarkdownMode,
    setSource,
    revealAt(offset) {
      pendingReveal = offset;
      update();
      void flushReveal();
    },
    pdf: () => tex.pdf(),
    destroy() {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (raf) cancelAnimationFrame(raf);
      tex.destroy();
      offImages();
      imageEdit.destroy();
      htmlSync.destroy();
      if (typingTimer) clearTimeout(typingTimer);
      clearTimeout(syncTimer);
      document.removeEventListener("selectionchange", onSelection);
      area.removeEventListener("input", onEdit);
      body.removeEventListener("dblclick", onJump);
      area.removeEventListener("input", onTyping);
      area.removeEventListener("input", update);
      tidy.remove();
      panel.remove();
    },
  };
}
