import { initImageEdit } from "./imageedit.ts";
import { onImagesChange } from "../images.ts";
import { fitBlanks, format, parse, toHtml } from "../markdown.ts";
import { isEditOf } from "../samedoc.ts";
import { createHtmlSync } from "./htmlsync.ts";
import { handleImageClick, resolveImages } from "./mdimages.ts";
import {
  cachedPdf,
  createPdfPool,
  digestOf,
  lastTex,
  type CompiledPdf,
} from "./pdfcache.ts";
import { buildPreviewHead, HEAD_TEXT } from "./previewhead.ts";
import { loadZoom, saveZoom, stepZoom, wheelZoom } from "./viewprefs.ts";

const TIDY_LIMIT = 400_000;
const TIDY_IDLE_MS = 5000;
const TEX_DELAY_MS = 700;
const RETRY_MS = [2000, 5000, 15000];
const STALE_COMPILE_MS = 3000;
const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

function isSameDocument(next: string, ref: string): boolean {
  if (next === ref) return true;
  const n = Math.min(200, ref.length);
  if (n === 0) return next.length === 0;
  return next.slice(0, n) === ref.slice(0, n);
}

const NETWORK_ERROR =
  /fake worker|dynamically imported module|Failed to fetch|NetworkError|Load failed|татагдсангүй|ачаалагдсангүй/i;

function explainTexError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (!NETWORK_ERROR.test(message)) return message || "PDF үүсгэж чадсангүй";
  if (!window.isSecureContext)
    return "Сервертэй холбогдож чадсангүй. Энэ хаяг HTTPS биш тул офлайн горим ажиллахгүй, localhost эсвэл HTTPS хаягаар нээнэ үү";
  return "Сервертэй холбогдож чадсангүй. Офлайн ажиллахын тулд нэг удаа онлайн үед хөрвүүлсэн байх шаардлагатай";
}

export type PreviewSource =
  | { kind: "pdf"; file: File }
  | { kind: "image"; file: File }
  | { kind: "office"; name: string };

export interface PreviewDeps {
  readonly wrap: HTMLElement;
  readonly area: HTMLTextAreaElement;
  readonly onFormat: (next: string) => void;
  readonly isLatex: (text: string) => boolean;
  readonly projectKey: () => string | null;
  readonly inProject: () => boolean;
  readonly pdfName: () => string;
  readonly jump: (start: number, end: number) => void;
}

export interface Preview {
  update(): void;
  setFileName(name: string | null): void;
  setMarkdownMode(on: boolean): void;
  setSource(src: PreviewSource | null): void;
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
    onZoom: (action) =>
      setZoom(
        action === "reset" ? 1 : stepZoom(zoom, action === "in" ? 1 : -1),
      ),
    onGoTo: (page) => pdfView?.goTo(page),
    canNavigate: () => pdfView !== null,
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
  const imageEdit = initImageEdit(body, area);
  const htmlSync = createHtmlSync(body, area, () => head.offsetHeight, jump);
  wrap.after(panel);

  const tidy = document.createElement("button");
  tidy.type = "button";
  tidy.className = "tidy-btn";
  tidy.textContent = "Хэлбэржүүлэх";
  tidy.title = "Markdown бичвэрийг жигдрүүлэх";
  tidy.hidden = true;

  const tools = wrap.querySelector<HTMLElement>(".editor-tools");
  const anchor = tools?.querySelector<HTMLElement>(".measure-ctl") ?? null;
  if (tools) tools.insertBefore(tidy, anchor);
  else head.append(tidy);

  let raf = 0;
  let tidied: string | null = null;
  let typingTimer = 0;
  const showTidy = (): void => {
    tidy.hidden = tidied === null || typingTimer !== 0 || !!source || texMode;
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
  let pdfView: import("./pdfview.ts").PdfView | null = null;

  let zoom = loadZoom();
  const setZoom = (next: number, origin?: { x: number; y: number }): void => {
    zoom = next;
    saveZoom(zoom);
    ui.showZoom(zoom);
    pdfView?.setZoom(zoom, origin);
  };
  setZoom(zoom);

  const pdfOptions = {
    inset: () => head.offsetHeight,
    onPage: ui.showPage,
  };
  const setPdfView = (view: import("./pdfview.ts").PdfView | null): void => {
    pdfView = view;
    panel.classList.toggle("has-pages", view !== null);
    if (!view) ui.closePageInput();
  };

  body.addEventListener(
    "wheel",
    (event) => {
      if (!pdfView || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!event.deltaY) return;
      setZoom(wheelZoom(zoom, event), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { passive: false },
  );
  let pdfAbort: AbortController | null = null;
  let shownHtml: string | null = null;
  let mathView: typeof import("./mathview.ts") | null = null;
  let texMode = false;
  let texShown: string | null = null;
  let pdfText: string | null = null;
  let shownPdf: Uint8Array<ArrayBuffer> | null = null;
  let texTimer = 0;
  let texSeq = 0;
  let texRestored = false;
  let pdfOfProject = false;
  let syncTimer = 0;
  let syncedAt = -1;
  let sourceCache: {
    readonly text: string;
    readonly words: readonly import("../tex/texsync.ts").SourceWord[];
  } | null = null;
  const pool = createPdfPool();

  const renderMarkdown = (): void => {
    const text = area.value;
    const blocks = text.trim() ? parse(text) : [];
    const html = blocks.length ? toHtml(fitBlanks(blocks)) : "";
    if (html !== shownHtml) {
      shownHtml = html;
      const next = document.createElement("div");
      next.innerHTML = html;
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
    const looksMd = isMdFile || markdownMode;
    if (looksMd && text.length <= TIDY_LIMIT && !isLatex(text)) {
      const next = format(text, blocks);
      if (next !== text) tidied = next;
    }
    showTidy();
  };

  const dropPdf = (): void => {
    shownPdf = null;
    downloadBtn.disabled = true;
    pdfText = null;
    texShown = null;
    pdfAbort?.abort();
    pdfAbort = null;
    pdfView?.destroy();
    setPdfView(null);
  };

  const renderPdf = async (file: File): Promise<void> => {
    const controller = new AbortController();
    pdfAbort = controller;
    body.classList.remove("is-empty");
    shownHtml = null;
    body.replaceChildren();
    try {
      const mod = await import("./pdfview.ts");
      if (controller.signal.aborted) return;
      const view = await mod.renderPdfInto(
        body,
        file,
        controller.signal,
        zoom,
        pdfOptions,
      );
      if (controller.signal.aborted) {
        view.destroy();
        return;
      }
      setPdfView(view);
    } catch {
      if (controller.signal.aborted) return;
      showNotice("PDF хуудсыг зурж чадсангүй");
    }
  };

  const setTexMissing = (paths: readonly string[]): void => {
    texMissing.hidden = paths.length === 0;
    texFolder.hidden = projectKey() !== null;
    texMissingText.textContent = paths.length
      ? "Зураг олдсонгүй: " + paths.join(", ")
      : "";
  };

  let offTexImages: (() => void) | null = null;
  let watchingImages = false;
  const watchImages = (mod: typeof import("../tex/teximages.ts")): void => {
    if (watchingImages) return;
    watchingImages = true;
    offTexImages = mod.onTexImagesChange(() => {
      if (!texMode) return;
      texShown = null;
      forced = true;
      update();
    });
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

  const syncToCaret = async (): Promise<void> => {
    if (!previewShown() || document.activeElement !== area) return;
    const caret = area.selectionStart;
    if (caret === syncedAt) return;
    if (area.dataset.layout) body.dataset.layout = area.dataset.layout;
    else delete body.dataset.layout;
    const view = pdfView;
    if (!texMode) {
      if (view || source || !shownHtml) return;
      syncedAt = caret;
      htmlSync.revealLine(area.value.slice(0, caret).split("\n").length - 1);
      return;
    }
    if (!view) return;
    syncedAt = caret;
    const { locate, sourceWords } = await import("../tex/texsync.ts");
    const words = sourceWordsOf(area.value, sourceWords);
    const pdf = await view.words();
    if (view !== pdfView) return;
    const hit = locate(words, caret, pdf);
    if (hit) view.reveal(hit.page, hit.y);
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
    if (view !== pdfView) return;
    const index = pdfWordAt(pdf, point.page, point.x, point.y);
    if (index < 0) return;
    const words = sourceWordsOf(area.value, sourceWords);
    const hit = locateSource(words, pdf, index);
    if (hit) jump(hit.at, hit.at + hit.word.length);
  };

  const onJump = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const view = pdfView;
    if (texMode && view) {
      void jumpFromPdf(view, event.clientX, event.clientY);
      return;
    }
    if (texMode || view || source || !shownHtml) return;
    if ((event.target as Element | null)?.closest("img, a, button, input"))
      return;
    htmlSync.jumpFrom(event.clientX, event.clientY);
  };
  body.addEventListener("dblclick", onJump);

  const onEdit = (): void => {
    syncedAt = -1;
  };

  const onSelection = (): void => {
    if (document.activeElement === area) scheduleSync();
  };
  document.addEventListener("selectionchange", onSelection);
  area.addEventListener("input", onEdit);

  const showPdfBytes = async (
    bytes: Uint8Array<ArrayBuffer>,
    seq: number,
  ): Promise<boolean> => {
    const mod = await import("./pdfview.ts");
    if (seq !== texSeq || !texMode) return false;
    const scroll = body.scrollTop;
    dropPdf();
    const controller = new AbortController();
    pdfAbort = controller;
    const file = new File([bytes], "preview.pdf", { type: "application/pdf" });
    const view = await mod.renderPdfInto(
      body,
      file,
      controller.signal,
      zoom,
      pdfOptions,
    );
    if (controller.signal.aborted) {
      view.destroy();
      return false;
    }
    setPdfView(view);
    shownPdf = bytes;
    panel.classList.remove("is-blank");
    body.classList.remove("is-empty");
    body.scrollTop = scroll;
    syncedAt = -1;
    scheduleSync();
    return true;
  };

  const restoreTex = async (text: string, seq: number): Promise<void> => {
    texRestored = true;
    const last = await lastTex();
    if (!last || seq !== texSeq || !texMode || !isEditOf(text, last.text))
      return;
    const bytes = await cachedPdf(last.digest);
    if (!bytes || seq !== texSeq || !texMode) return;
    if (await showPdfBytes(bytes, seq).catch(() => false)) {
      pdfText = last.text;
      pdfOfProject = false;
    }
  };

  const markShown = (key: string): void => {
    texShown = key;
    downloadBtn.disabled = shownPdf === null;
  };

  const showCompiled = (
    key: string,
    text: string,
    project: string | null,
    missing: readonly string[],
  ): void => {
    texRestored = true;
    pdfText = text;
    pdfOfProject = project !== null;
    markShown(key);
    setTexError(null);
    setTexMissing(missing);
  };

  let retryTimer = 0;
  let retries = 0;
  let triedText: string | null = null;
  let compiling: string | null = null;
  let savingPdf = 0;
  let forced = false;

  const cancelRetry = (): void => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = 0;
  };

  const texKey = (): string => {
    const project = projectKey();
    return project === null ? area.value : "\u0000project:" + project;
  };

  const renderTex = async (): Promise<void> => {
    texTimer = 0;
    cancelRetry();
    const text = area.value;
    const project = projectKey();
    const key = texKey();
    if (!texMode || key === texShown || key === compiling || !previewShown())
      return;
    if (key !== triedText) {
      triedText = key;
      retries = 0;
    }
    const seq = ++texSeq;
    const force = forced;
    forced = false;
    compileBtn.disabled = true;
    const kept = force ? undefined : pool.touch(key);
    if (kept) {
      const shown = await showPdfBytes(kept.pdf, seq).catch(() => false);
      if (seq !== texSeq) return;
      compileBtn.disabled = false;
      if (shown) {
        showCompiled(key, kept.text, project, kept.missing);
        return;
      }
    }
    const digest = await digestOf(text, project);
    if (seq !== texSeq || !texMode) return;
    const cached = digest === null || force ? null : await cachedPdf(digest);
    if (cached && (await showPdfBytes(cached, seq).catch(() => false))) {
      pool.put(key, { text, pdf: cached, missing: [] });
      showCompiled(key, text, project, []);
      compileBtn.disabled = false;
      return;
    }
    if (seq !== texSeq || !texMode) return;
    if (!texRestored && project === null) await restoreTex(text, seq);
    texRestored = true;
    if (seq !== texSeq || !texMode) return;
    if (
      pdfView &&
      (pdfOfProject !== (project !== null) ||
        (project === null && (pdfText === null || !isEditOf(text, pdfText))))
    ) {
      dropPdf();
      setTexError(null);
    }
    if (!pdfView) {
      showNotice("PDF бэлтгэж байна…");
      texShown = null;
    }
    void import("../tex/texpdf.ts").then((mod) => {
      if (!savingPdf && mod.compileRunningFor() > STALE_COMPILE_MS)
        mod.cancelCompile();
    });
    compiling = key;
    try {
      const [{ compileTexDocument, onTexPackage }, images] = await Promise.all([
        import("../tex/texpdf.ts"),
        import("../tex/teximages.ts"),
      ]);
      watchImages(images);
      onTexPackage((message) => {
        if (seq === texSeq && texMode && !pdfView)
          showNotice(message ?? "PDF бэлтгэж байна…");
      });
      const { pdf, missing } = await pool.compile(key, () =>
        compileTexDocument(text),
      );
      pool.keep(key, { text, pdf, missing }, digest, project);
      if (!(await showPdfBytes(pdf, seq))) return;
      retries = 0;
      showCompiled(key, text, project, missing);
    } catch (error) {
      if (seq !== texSeq || !texMode) return;
      texShown = key;
      const delay = RETRY_MS[retries];
      const message =
        explainTexError(error) + (delay ? " — дахин оролдож байна…" : "");
      if (pdfView) setTexError(message);
      else showNotice(message);
      if (delay) {
        retries++;
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          if (!texMode || texKey() !== key) return;
          texShown = null;
          void renderTex();
        }, delay);
      }
    } finally {
      if (compiling === key) compiling = null;
      if (seq === texSeq) compileBtn.disabled = false;
    }
  };

  const recompile = (): void => {
    if (compiling !== null) return;
    forced = true;
    retries = 0;
    triedText = null;
    texShown = null;
    void renderTex();
  };
  compileBtn.addEventListener("click", recompile);
  downloadBtn.addEventListener("click", () => {
    const bytes = shownPdf;
    if (!bytes) return;
    void import("../export.ts").then(({ deliverFile }) =>
      deliverFile(bytes, pdfName(), "application/pdf"),
    );
  });

  const setTexMode = (on: boolean): void => {
    if (on === texMode) return;
    texMode = on;
    texSeq++;
    texRestored = false;
    compiling = null;
    cancelRetry();
    compileBtn.disabled = false;
    panel.classList.toggle("tex-mode", on);
    if (texTimer) clearTimeout(texTimer);
    texTimer = 0;
    texShown = null;
    dropPdf();
    setTexError(null);
    setTexMissing([]);
    shownHtml = null;
    body.replaceChildren();
    panel.classList.remove("is-blank");
    panel.classList.toggle("is-pdf", on);
    tidy.hidden = true;
  };

  const update = (): void => {
    if (source) {
      if (!isSameDocument(area.value, sourceText)) setSource(null);
      return;
    }
    setTexMode(isLatex(area.value));
    if (texMode) {
      if (texKey() !== texShown) downloadBtn.disabled = true;
      const project = inProject();
      if (
        pdfView &&
        (pdfOfProject !== project ||
          (!project && pdfText !== null && !isEditOf(area.value, pdfText)))
      ) {
        dropPdf();
        setTexError(null);
        setTexMissing([]);
      }
      if (texTimer) clearTimeout(texTimer);
      texTimer = window.setTimeout(
        () => void renderTex(),
        texShown === null ? 0 : TEX_DELAY_MS,
      );
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      renderMarkdown();
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
    source = next;
    setTexMode(false);
    tidy.hidden = true;
    dropPdf();
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
      void renderPdf(next.file);
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
    if (tidied !== null) onFormat(tidied);
  });

  body.addEventListener("click", (event) =>
    handleImageClick(body, event.target as Element),
  );

  const offImages = onImagesChange(() => {
    if (source || texMode) return;
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
    async pdf() {
      const text = area.value;
      const project = projectKey();
      const key = texKey();
      const kept = pool.get(key);
      if (kept) return kept;
      if (texMode && shownPdf && !downloadBtn.disabled && texShown === key)
        return { pdf: shownPdf, missing: [] };
      savingPdf++;
      try {
        const running = pool.running(key);
        if (running) {
          const result = await running.catch(() => null);
          if (result) return result;
        }
        const digest = await digestOf(text, project);
        const cached = digest === null ? null : await cachedPdf(digest);
        if (cached) return { pdf: cached, missing: [] };
        const { compileTexDocument } = await import("../tex/texpdf.ts");
        const { pdf, missing } = await pool.compile(key, () =>
          compileTexDocument(text),
        );
        pool.keep(key, { text, pdf, missing }, digest, project);
        return { pdf, missing };
      } finally {
        savingPdf--;
      }
    },
    destroy() {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (raf) cancelAnimationFrame(raf);
      if (texTimer) clearTimeout(texTimer);
      cancelRetry();
      dropPdf();
      offImages();
      offTexImages?.();
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
