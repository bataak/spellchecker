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
  body.addEventListener("click", (event) =>
    handleImageClick(body, event.target as Element),
  );
  const htmlSync = createHtmlSync(
    body,
    area,
    () => ui.head.offsetHeight,
    deps.jump,
  );
  wrap.after(panel);
  return { panel, ui, body, notes, pane, imageEdit, htmlSync };
}

interface ToolState {
  readonly tex: () => ReturnType<typeof createTexPreview>;
  readonly hasSource: () => boolean;
  readonly mdShown: () => boolean;
}

function previewTools(
  deps: PreviewDeps,
  head: HTMLElement,
  body: HTMLElement,
  pane: ReturnType<typeof createPdfPane>,
  htmlSync: ReturnType<typeof createHtmlSync>,
  t: ToolState,
) {
  const tidy = createTidy({
    wrap: deps.wrap,
    head,
    area: deps.area,
    onFormat: deps.onFormat,
    texActive: () => t.tex().active(),
    hasSource: t.hasSource,
    isLatex: deps.isLatex,
  });
  const sync = createPreviewSync({
    area: deps.area,
    body,
    view: () => pane.view(),
    htmlSync,
    texActive: () => t.tex().active(),
    texPending: () => t.tex().pending(),
    htmlShown: () => !t.hasSource() && t.mdShown(),
    jump: deps.jump,
  });
  return { tidy, sync };
}

function showSource(
  next: PreviewSource,
  title: HTMLElement,
  panel: HTMLElement,
  files: ReturnType<typeof createFileView>,
  showNotice: (text: string) => void,
): void {
  const name = next.kind === "office" ? next.name : next.file.name;
  title.textContent = `${HEAD_TEXT} · ${name}`;
  panel.classList.toggle("is-pdf", next.kind === "pdf");
  if (next.kind === "office") showNotice("Уг файлыг үзүүлэх боломжгүй");
  else files.show(next.kind, next.file);
}

function stopAll(stops: readonly (() => unknown)[]): void {
  for (const stop of stops) stop();
}

function previewApi(
  update: () => void,
  setSource: (next: PreviewSource | null) => void,
  sync: ReturnType<typeof createPreviewSync>,
  tex: ReturnType<typeof createTexPreview>,
  modes: {
    file(name: string | null): void;
    markdown(on: boolean): void;
  },
  destroy: () => void,
): Preview {
  return {
    update,
    setFileName: modes.file,
    setMarkdownMode: modes.markdown,
    setSource,
    revealAt(offset) {
      sync.reveal(offset);
      update();
      void sync.flush();
    },
    pdf: () => tex.pdf(),
    destroy,
  };
}

function createMdRender(
  area: HTMLTextAreaElement,
  md: ReturnType<typeof createMarkdownView>,
  imageEdit: ReturnType<typeof initImageEdit>,
  tidy: ReturnType<typeof createTidy>,
  sync: ReturnType<typeof createPreviewSync>,
) {
  let raf = 0;
  let isMdFile = false;
  let markdownMode = false;
  return {
    schedule(): void {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const text = area.value;
        const blocks = md.render(text, () => imageEdit.refresh());
        tidy.markdown(text, blocks, isMdFile || markdownMode);
        void sync.flush();
      });
    },
    cancel(): void {
      if (raf) cancelAnimationFrame(raf);
    },
    file(name: string | null): void {
      isMdFile = MD_NAME.test(name ?? "");
    },
    markdown(on: boolean): boolean {
      if (on === markdownMode) return false;
      markdownMode = on;
      md.clear();
      return true;
    },
  };
}

function noticeIn(
  panel: HTMLElement,
  body: HTMLElement,
  md: ReturnType<typeof createMarkdownView>,
): (text: string) => void {
  return (text) => {
    md.clear();
    body.replaceChildren(noticeOf(text));
    body.classList.remove("is-empty");
    panel.classList.add("is-blank");
  };
}

export function initPreview(deps: PreviewDeps): Preview {
  const { area, isLatex } = deps;
  const { panel, ui, body, notes, pane, imageEdit, htmlSync } =
    buildPreview(deps);

  let source: PreviewSource | null = null;
  let sourceText = "";
  const md = createMarkdownView(body);
  const { tidy, sync } = previewTools(deps, ui.head, body, pane, htmlSync, {
    tex: () => tex,
    hasSource: () => source !== null,
    mdShown: () => md.shown(),
  });
  const offTap = onDoubleTap(body, sync.jumpAt);

  const showNotice = noticeIn(panel, body, md);
  const mdRender = createMdRender(area, md, imageEdit, tidy, sync);
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
    mdRender.schedule();
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
    showSource(next, ui.title, panel, files, showNotice);
  };

  const offImages = onImagesChange(() => {
    if (source || tex.active()) return;
    md.clear();
    update();
  });
  area.addEventListener("input", update);
  update();

  const modes = {
    file(name: string | null): void {
      mdRender.file(name);
      update();
    },
    markdown(on: boolean): void {
      if (mdRender.markdown(on)) update();
    },
  };
  return previewApi(update, setSource, sync, tex, modes, () => {
    stopAll([
      files.release,
      mdRender.cancel,
      tex.destroy,
      compileMode.destroy,
      offImages,
      imageEdit.destroy,
      htmlSync.destroy,
      sync.destroy,
      offTap,
      tidy.destroy,
    ]);
    area.removeEventListener("input", update);
    panel.remove();
  });
}
