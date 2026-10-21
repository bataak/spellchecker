import { initImageEdit } from "./imageedit.ts";
import { onImagesChange } from "../files/images.ts";
import { createHtmlSync } from "./htmlsync.ts";
import { handleImageClick } from "./mdimages.ts";
import { createFileView } from "./previewfile.ts";
import { createMarkdownView } from "./previewmd.ts";
import type { CompiledPdf } from "./pdfcache.ts";
import { createPdfPane } from "./pdfpane.ts";
import { buildPreviewHead, HEAD_TEXT } from "./previewhead.ts";
import { createTexPreview } from "./texpreview.ts";
import { initCompileButton } from "./compilemode.ts";
import type { TexProject } from "../project/projectbuild.ts";
import { onDoubleTap } from "./previewgesture.ts";
import { createPreviewSync, previewShown } from "./previewsync.ts";
import { createTidy } from "./previewtidy.ts";
import { chooseImageFolder } from "../tex/teximages.ts";
import { deliverFile } from "../export/export.ts";

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
  readonly notify: (html: string, ms: number, animate: boolean) => void;
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

function buildNotes(projectKey: () => string | null) {
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
    void chooseImageFolder();
  });
  texMissing.append(texMissingText, texFolder);
  const notes = document.createElement("div");
  notes.className = "preview-notes";
  notes.append(texMissing, texError);
  return {
    notes,
    setMissing(paths: readonly string[]): void {
      texMissing.hidden = paths.length === 0;
      texFolder.hidden = projectKey() !== null;
      texMissingText.textContent = paths.length
        ? "Зураг олдсонгүй: " + paths.join(", ")
        : "";
    },
    setError(message: string | null): void {
      texError.hidden = message === null;
      texError.textContent = message ?? "";
    },
  };
}

function noticeOf(text: string): HTMLElement {
  const note = document.createElement("p");
  note.className = "preview-notice";
  note.textContent = text;
  return note;
}

interface TexWiring {
  readonly deps: PreviewDeps;
  readonly pane: ReturnType<typeof createPdfPane>;
  readonly ui: ReturnType<typeof buildPreviewHead>;
  readonly notes: ReturnType<typeof buildNotes>;
  readonly showNotice: (text: string) => void;
  readonly shown: () => void;
  readonly update: () => void;
}

function wireTex(w: TexWiring) {
  const { deps, pane, ui } = w;
  const tex = createTexPreview({
    area: deps.area,
    pane,
    compileBtn: ui.compileBtn,
    downloadBtn: ui.downloadBtn,
    projectKey: deps.projectKey,
    inProject: deps.inProject,
    texProject: deps.texProject,
    visible: previewShown,
    showNotice: w.showNotice,
    setError: w.notes.setError,
    setMissing: w.notes.setMissing,
    onShown: w.shown,
    onImagesChanged: w.update,
    onModeChange: (_auto, note) => {
      compileMode.paint();
      if (note) deps.notify(note, 9000, false);
    },
  });
  const compileMode = initCompileButton({
    button: ui.compileBtn,
    area: deps.area,
    active: () => tex.active(),
    auto: () => tex.auto(),
    compile: () => tex.compileNow(),
    toAuto: () => tex.setAuto(true),
  });
  ui.downloadBtn.addEventListener("click", () => {
    const bytes = pane.shown();
    if (!bytes) return;
    void deliverFile(bytes, deps.pdfName(), "application/pdf");
  });
  return { tex, compileMode };
}

function buildPreview(deps: PreviewDeps) {
  const { wrap, area } = deps;
  const panel = document.createElement("section");
  panel.className = "preview-panel";
  panel.setAttribute("aria-label", "Харагдац");
  const ui = buildPreviewHead(panel, {
    onZoom: (action) => pane.zoom(action),
    onGoTo: (page) => pane.goTo(page),
    canNavigate: () => pane.view() !== null,
  });
  const body = document.createElement("div");
  body.className = "preview-body";
  const notes = buildNotes(deps.projectKey);
  panel.append(ui.head, body, notes.notes);
  const pane = createPdfPane(panel, body, () => ui);
  pane.syncZoom();
  const imageEdit = initImageEdit(body, area);
  const htmlSync = createHtmlSync(
    body,
    area,
    () => ui.head.offsetHeight,
    deps.jump,
  );
  wrap.after(panel);
  return { panel, ui, body, notes, pane, imageEdit, htmlSync };
}

export function initPreview(deps: PreviewDeps): Preview {
  const { wrap, area, isLatex } = deps;
  const { panel, ui, body, notes, pane, imageEdit, htmlSync } =
    buildPreview(deps);

  let raf = 0;
  let isMdFile = false;
  let markdownMode = false;
  let source: PreviewSource | null = null;
  let sourceText = "";
  const md = createMarkdownView(body);
  const tidy = createTidy({
    wrap,
    head: ui.head,
    area,
    onFormat: deps.onFormat,
    texActive: () => tex.active(),
    hasSource: () => source !== null,
    isLatex,
  });
  const sync = createPreviewSync({
    area,
    body,
    view: () => pane.view(),
    htmlSync,
    texActive: () => tex.active(),
    texPending: () => tex.pending(),
    htmlShown: () => source === null && md.shown(),
    jump: deps.jump,
  });
  const offTap = onDoubleTap(body, sync.jumpAt);

  const showNotice = (text: string): void => {
    md.clear();
    body.replaceChildren(noticeOf(text));
    body.classList.remove("is-empty");
    panel.classList.add("is-blank");
  };
  const files = createFileView(body, pane, showNotice);
  const { tex, compileMode } = wireTex({
    deps,
    pane,
    ui,
    notes,
    showNotice,
    shown: () => sync.shown(),
    update: () => update(),
  });

  const setTexMode = (on: boolean): void => {
    if (!tex.setActive(on)) return;
    panel.classList.toggle("tex-mode", on);
    md.clear();
    body.replaceChildren();
    panel.classList.remove("is-blank");
    panel.classList.toggle("is-pdf", on);
    tidy.hide();
  };

  const update = (): void => {
    if (source) {
      if (!isSameDocument(area.value, sourceText)) setSource(null);
      return;
    }
    setTexMode(isLatex(area.value));
    if (tex.active()) {
      tex.schedule();
      tidy.latex();
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const text = area.value;
      const blocks = md.render(text, () => imageEdit.refresh());
      tidy.markdown(text, blocks, isMdFile || markdownMode);
      void sync.flush();
    });
  };

  const setSource = (next: PreviewSource | null): void => {
    if (next === null && source === null) return;
    source = next;
    setTexMode(false);
    tidy.hide();
    tex.drop();
    files.release();
    panel.classList.remove("is-blank");
    md.clear();
    if (!next) {
      ui.title.textContent = HEAD_TEXT;
      panel.classList.remove("is-pdf");
      body.replaceChildren();
      update();
      return;
    }
    sourceText = area.value;
    const name = next.kind === "office" ? next.name : next.file.name;
    ui.title.textContent = `${HEAD_TEXT} · ${name}`;
    panel.classList.toggle("is-pdf", next.kind === "pdf");
    if (next.kind === "office") showNotice("Уг файлыг үзүүлэх боломжгүй");
    else files.show(next.kind, next.file);
  };

  body.addEventListener("click", (event) =>
    handleImageClick(body, event.target as Element),
  );
  const offImages = onImagesChange(() => {
    if (source || tex.active()) return;
    md.clear();
    update();
  });
  area.addEventListener("input", update);
  update();

  return {
    update,
    setFileName(name) {
      isMdFile = MD_NAME.test(name ?? "");
      update();
    },
    setMarkdownMode(on) {
      if (on === markdownMode) return;
      markdownMode = on;
      md.clear();
      update();
    },
    setSource,
    revealAt(offset) {
      sync.reveal(offset);
      update();
      void sync.flush();
    },
    pdf: () => tex.pdf(),
    destroy() {
      files.release();
      if (raf) cancelAnimationFrame(raf);
      tex.destroy();
      compileMode.destroy();
      offImages();
      imageEdit.destroy();
      htmlSync.destroy();
      sync.destroy();
      offTap();
      tidy.destroy();
      area.removeEventListener("input", update);
      panel.remove();
    },
  };
}
