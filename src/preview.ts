import { initImageEdit } from "./imageedit.ts";
import {
  allowRemoteImages,
  imageUrl,
  isBlockedRemote,
  onImagesChange,
  pickImage,
  prepareImage,
  putImage,
} from "./images.ts";
import { fitBlanks, format, parse, toHtml } from "./markdown.ts";
import { isEditOf } from "./samedoc.ts";
import { KEYS, read, remove, write } from "./store.ts";

const TIDY_LIMIT = 400_000;
const TIDY_IDLE_MS = 5000;
const TEX_DELAY_MS = 700;

function isSameDocument(next: string, ref: string): boolean {
  if (next === ref) return true;
  const n = Math.min(200, ref.length);
  if (n === 0) return next.length === 0;
  return next.slice(0, n) === ref.slice(0, n);
}

const HEAD_TEXT = "Харагдац";
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function loadZoom(): number {
  const value = Number(read(KEYS.pdfZoom));
  return value > 0 ? clampZoom(value) : 1;
}

function saveZoom(zoom: number): void {
  if (zoom === 1) remove(KEYS.pdfZoom);
  else write(KEYS.pdfZoom, String(zoom));
}

const PDF_CACHE = "tex-preview";
const PDF_TEXT_KEY = "tex-preview/last.tex";
const CACHED_PDFS = 6;
const KEPT_PDFS = 3;

const pdfUrl = (digest: string): string => "tex-preview/" + digest + ".pdf";

async function textKey(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function cachedPdf(
  digest: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const cache = await caches.open(PDF_CACHE);
    const hit = await cache.match(pdfUrl(digest));
    if (!hit) return null;
    const bytes = new Uint8Array(await hit.arrayBuffer());
    void cache.put(
      pdfUrl(digest),
      new Response(bytes.slice(), {
        headers: { "content-type": "application/pdf" },
      }),
    );
    return bytes;
  } catch {
    return null;
  }
}

async function lastTex(): Promise<{ digest: string; text: string } | null> {
  try {
    const cache = await caches.open(PDF_CACHE);
    const hit = await cache.match(PDF_TEXT_KEY);
    const digest = hit?.headers.get("x-text-key");
    return hit && digest ? { digest, text: await hit.text() } : null;
  } catch {
    return null;
  }
}

async function saveCachedPdf(
  digest: string,
  bytes: Uint8Array<ArrayBuffer>,
  text: string | null,
): Promise<void> {
  try {
    const cache = await caches.open(PDF_CACHE);
    await cache.put(
      pdfUrl(digest),
      new Response(bytes.slice(), {
        headers: { "content-type": "application/pdf" },
      }),
    );
    if (text !== null)
      await cache.put(
        PDF_TEXT_KEY,
        new Response(text, {
          headers: { "content-type": "text/plain", "x-text-key": digest },
        }),
      );
    const pdfs = (await cache.keys()).filter((request) =>
      request.url.endsWith(".pdf"),
    );
    for (const request of pdfs.slice(0, Math.max(0, pdfs.length - CACHED_PDFS)))
      await cache.delete(request);
  } catch {}
}

const ZOOM_MIN = ZOOM_STEPS[0]!;
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

function clampZoom(zoom: number): number {
  return Math.min(Math.max(Math.round(zoom * 1000) / 1000, ZOOM_MIN), ZOOM_MAX);
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

function stepZoom(zoom: number, dir: number): number {
  const next =
    dir > 0
      ? ZOOM_STEPS.find((step) => step > zoom + 0.001)
      : [...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001);
  return next ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN);
}
const SVG_NS = "http://www.w3.org/2000/svg";

function loadInvert(): boolean {
  return read(KEYS.pdfInvert) !== "off";
}

function saveInvert(on: boolean): void {
  write(KEYS.pdfInvert, on ? "on" : "off");
}

function compileGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "tex-compile-glyph");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M13 8a5 5 0 1 1-1.46-3.54", "M13 2.5V5.5H10"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function downloadGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "tex-compile-glyph");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M8 2.5v8", "M4.5 7 8 10.5 11.5 7", "M3 13.5h10"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function contrastGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "pdf-invert-glyph");
  svg.setAttribute("aria-hidden", "true");

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "8");
  ring.setAttribute("cy", "8");
  ring.setAttribute("r", "6.25");
  ring.setAttribute("class", "pdf-invert-ring");
  svg.append(ring);

  const half = document.createElementNS(SVG_NS, "path");
  half.setAttribute("d", "M8 1.75a6.25 6.25 0 0 1 0 12.5z");
  half.setAttribute("class", "pdf-invert-half");
  svg.append(half);

  return svg;
}

function displayPath(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

function hostOf(src: string): string {
  try {
    return new URL(src).host;
  } catch {
    return src;
  }
}

function resolveImages(root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img.md-image")) {
    const src = img.dataset.src ?? "";
    if (isBlockedRemote(src)) {
      const remote = document.createElement("button");
      remote.type = "button";
      remote.className = "md-image-remote";
      remote.dataset.src = src;
      remote.style.cssText = img.style.cssText;
      remote.title = hostOf(src);
      remote.textContent = "Гадны зураг · ачаалах";
      img.replaceWith(remote);
      continue;
    }
    const url = imageUrl(src);
    const rotate = Number(img.dataset.rotate) || 0;
    if (url && rotate) {
      void prepareImage({ src, rotate }).then((ready) => {
        if (ready) img.src = ready.url;
      });
      continue;
    }
    if (url) {
      img.src = url;
      continue;
    }
    const missing = document.createElement("button");
    missing.type = "button";
    missing.className = "md-image-missing";
    missing.dataset.src = src;
    missing.style.cssText = img.style.cssText;
    missing.title = "Зургийг сонгох";
    missing.textContent = displayPath(src);
    img.replaceWith(missing);
  }
}

export type PreviewSource =
  | { kind: "pdf"; file: File }
  | { kind: "image"; file: File }
  | { kind: "office"; name: string };

const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

export interface Preview {
  update(): void;
  setFileName(name: string | null): void;
  setMarkdownMode(on: boolean): void;
  setSource(src: PreviewSource | null): void;
  destroy(): void;
}

export function initPreview(
  wrap: HTMLElement,
  area: HTMLTextAreaElement,
  onFormat?: (next: string) => void,
  isLatex: (text: string) => boolean = () => false,
  projectKey: () => string | null = () => null,
  inProject: () => boolean = () => false,
  pdfName: () => string = () => "бичвэр.pdf",
): Preview {
  const panel = document.createElement("section");
  panel.className = "preview-panel";
  panel.setAttribute("aria-label", "Харагдац");

  const head = document.createElement("div");
  head.className = "preview-head";

  const title = document.createElement("span");
  title.className = "preview-title";
  title.textContent = HEAD_TEXT;

  let invert = loadInvert();
  const invertBtn = document.createElement("button");
  invertBtn.type = "button";
  invertBtn.className = "pdf-invert";
  invertBtn.title = "Хуудсыг цагаанаар харах";
  invertBtn.setAttribute("aria-label", invertBtn.title);
  invertBtn.append(contrastGlyph());

  const applyInvert = (): void => {
    panel.classList.toggle("no-invert", !invert);
    invertBtn.setAttribute("aria-pressed", String(!invert));
  };
  invertBtn.addEventListener("mousedown", (event) => event.preventDefault());
  invertBtn.addEventListener("click", () => {
    invert = !invert;
    saveInvert(invert);
    applyInvert();
  });

  let zoom = loadZoom();
  const zoomBox = document.createElement("span");
  zoomBox.className = "pdf-zoom";
  const zoomButton = (label: string, text: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.textContent = text;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  };
  const zoomOut = zoomButton("Жижигрүүлэх", "−");
  const zoomReset = zoomButton("Анхны хэмжээ", "100%");
  const zoomIn = zoomButton("Томруулах", "+");
  zoomReset.className = "pdf-zoom-level";
  zoomBox.append(zoomOut, zoomReset, zoomIn);

  const pageNav = document.createElement("span");
  pageNav.className = "pdf-page-nav";
  const pageLabel = document.createElement("button");
  pageLabel.type = "button";
  pageLabel.className = "pdf-page-label";
  pageLabel.title = "Хуудас руу очих";
  const pageInput = document.createElement("input");
  pageInput.type = "text";
  pageInput.inputMode = "numeric";
  pageInput.className = "pdf-page-input";
  pageInput.setAttribute("aria-label", "Хуудасны дугаар");
  pageInput.hidden = true;
  pageNav.append(pageLabel, pageInput);

  const compileButton = (className: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.title = "Дахин хөрвүүлэх";
    button.setAttribute("aria-label", button.title);
    button.append(compileGlyph());
    button.addEventListener("mousedown", (event) => event.preventDefault());
    return button;
  };
  const compileBtn = compileButton("tex-compile");
  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "tex-compile tex-download";
  downloadBtn.title = "PDF татах";
  downloadBtn.setAttribute("aria-label", downloadBtn.title);
  downloadBtn.disabled = true;
  downloadBtn.append(downloadGlyph());
  downloadBtn.addEventListener("mousedown", (event) => event.preventDefault());

  head.append(title, pageNav, compileBtn, downloadBtn, zoomBox, invertBtn);

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
    void import("./teximages.ts").then((mod) => mod.chooseImageFolder());
  });
  texMissing.append(texMissingText, texFolder);

  const notes = document.createElement("div");
  notes.className = "preview-notes";
  notes.append(texMissing, texError);

  applyInvert();
  panel.append(head, body, notes);
  const imageEdit = initImageEdit(body, area);
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

  const setZoom = (next: number, origin?: { x: number; y: number }): void => {
    zoom = next;
    saveZoom(zoom);
    zoomReset.textContent = Math.round(zoom * 100) + "%";
    zoomOut.disabled = zoom <= ZOOM_MIN;
    zoomIn.disabled = zoom >= ZOOM_MAX;
    pdfView?.setZoom(zoom, origin);
  };
  setZoom(zoom);
  zoomOut.addEventListener("click", () => setZoom(stepZoom(zoom, -1)));
  zoomIn.addEventListener("click", () => setZoom(stepZoom(zoom, 1)));
  zoomReset.addEventListener("click", () => setZoom(1));

  let page = 1;
  let pages = 0;
  const showPage = (next: number, total: number): void => {
    page = next;
    pages = total;
    pageLabel.textContent = page + " / " + pages;
    pageLabel.setAttribute(
      "aria-label",
      "Хуудас " + page + " / " + pages + ". Хуудас руу очих",
    );
  };
  const closePageInput = (): void => {
    if (pageInput.hidden) return;
    pageInput.hidden = true;
    pageLabel.hidden = false;
  };
  pageLabel.addEventListener("click", () => {
    if (!pdfView) return;
    pageLabel.hidden = true;
    pageInput.hidden = false;
    pageInput.style.width = String(pages).length + 2 + "ch";
    pageInput.value = String(page);
    pageInput.focus();
    pageInput.select();
  });
  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePageInput();
      pageLabel.focus();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const target = Number.parseInt(pageInput.value.trim(), 10);
    if (Number.isFinite(target)) pdfView?.goTo(target);
    closePageInput();
    pageLabel.focus();
  });
  pageInput.addEventListener("blur", closePageInput);
  const pdfOptions = {
    inset: () => head.offsetHeight,
    onPage: showPage,
  };
  const setPdfView = (view: import("./pdfview.ts").PdfView | null): void => {
    pdfView = view;
    panel.classList.toggle("has-pages", view !== null);
    if (!view) closePageInput();
  };

  body.addEventListener(
    "wheel",
    (event) => {
      if (!pdfView || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      if (!event.deltaY) return;
      const origin = { x: event.clientX, y: event.clientY };
      const notch =
        event.deltaMode !== 0 ||
        (Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY));
      if (notch) {
        setZoom(stepZoom(zoom, event.deltaY < 0 ? 1 : -1), origin);
        return;
      }
      const delta = Math.max(Math.min(event.deltaY, 50), -50);
      setZoom(clampZoom(zoom * Math.exp(-delta / 100)), origin);
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
  const keptPdfs = new Map<
    string,
    {
      readonly text: string;
      readonly pdf: Uint8Array<ArrayBuffer>;
      readonly missing: readonly string[];
    }
  >();

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
    if (onFormat && looksMd && text.length <= TIDY_LIMIT && !isLatex(text)) {
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
  const watchImages = (mod: typeof import("./teximages.ts")): void => {
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
    document.documentElement.dataset.preview === "on";

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

  const digestOf = async (
    text: string,
    project: string | null,
  ): Promise<string | null> => {
    if (project === null) return textKey(text);
    const { projectDigest } = await import("./projectstore.ts");
    return projectDigest();
  };

  const RETRY_MS = [2000, 5000, 15000];
  let retryTimer = 0;
  let retries = 0;
  let triedText: string | null = null;
  let compiling: string | null = null;
  let forced = false;
  const STALE_COMPILE_MS = 3000;

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
    const kept = force ? undefined : keptPdfs.get(key);
    if (kept) {
      keptPdfs.delete(key);
      keptPdfs.set(key, kept);
      const shown = await showPdfBytes(kept.pdf, seq).catch(() => false);
      if (seq !== texSeq) return;
      compileBtn.disabled = false;
      if (shown) {
        texRestored = true;
        pdfText = kept.text;
        pdfOfProject = project !== null;
        markShown(key);
        setTexError(null);
        setTexMissing(kept.missing);
        return;
      }
    }
    const digest = await digestOf(text, project);
    if (seq !== texSeq || !texMode) return;
    const cached = digest === null || force ? null : await cachedPdf(digest);
    if (cached && (await showPdfBytes(cached, seq).catch(() => false))) {
      texRestored = true;
      pdfText = text;
      pdfOfProject = project !== null;
      markShown(key);
      keptPdfs.delete(key);
      keptPdfs.set(key, { text, pdf: cached, missing: [] });
      setTexError(null);
      setTexMissing([]);
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
    void import("./texpdf.ts").then((mod) => {
      if (mod.compileRunningFor() > STALE_COMPILE_MS) mod.cancelCompile();
    });
    compiling = key;
    try {
      const [{ compileTexDocument, onTexPackage }, images] = await Promise.all([
        import("./texpdf.ts"),
        import("./teximages.ts"),
      ]);
      watchImages(images);
      onTexPackage((message) => {
        if (seq === texSeq && texMode && !pdfView)
          showNotice(message ?? "PDF бэлтгэж байна…");
      });
      const { pdf, missing } = await compileTexDocument(text);
      if (!(await showPdfBytes(pdf, seq))) return;
      pdfText = text;
      markShown(key);
      pdfOfProject = project !== null;
      keptPdfs.delete(key);
      keptPdfs.set(key, { text, pdf, missing });
      while (keptPdfs.size > KEPT_PDFS)
        keptPdfs.delete(keptPdfs.keys().next().value!);
      retries = 0;
      setTexError(null);
      setTexMissing(missing);
      if (!missing.length && digest !== null)
        void saveCachedPdf(digest, pdf, project === null ? text : null);
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
    void import("./export.ts").then(({ deliverFile }) =>
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
    if (onFormat && tidied !== null) onFormat(tidied);
  });

  body.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".md-image-remote")) {
      allowRemoteImages(
        [...body.querySelectorAll<HTMLElement>(".md-image-remote")].map(
          (el) => el.dataset.src ?? "",
        ),
      );
      return;
    }
    const missing = (event.target as Element).closest<HTMLElement>(
      ".md-image-missing",
    );
    if (!missing) return;
    const src = missing.dataset.src ?? "";
    void pickImage().then((file) => {
      if (file) putImage(src, file);
    });
  });

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
    destroy() {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (raf) cancelAnimationFrame(raf);
      if (texTimer) clearTimeout(texTimer);
      cancelRetry();
      dropPdf();
      offImages();
      offTexImages?.();
      imageEdit.destroy();
      if (typingTimer) clearTimeout(typingTimer);
      area.removeEventListener("input", onTyping);
      area.removeEventListener("input", update);
      tidy.remove();
      panel.remove();
    },
  };
}
