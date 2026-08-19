import { isMarkdown, parse, print, toHtml } from "./markdown.ts";

const TIDY_LIMIT = 400_000;

function isSameDocument(next: string, ref: string): boolean {
  if (next === ref) return true;
  const n = Math.min(200, ref.length);
  if (n === 0) return next.length === 0;
  return next.slice(0, n) === ref.slice(0, n);
}

const HEAD_TEXT = "Харагдац";
const INVERT_KEY = "pdfInvert";
const SVG_NS = "http://www.w3.org/2000/svg";

function loadInvert(): boolean {
  try {
    return localStorage.getItem(INVERT_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveInvert(on: boolean): void {
  try {
    localStorage.setItem(INVERT_KEY, on ? "on" : "off");
  } catch {}
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

export type PreviewSource =
  | { kind: "pdf"; file: File }
  | { kind: "office"; name: string };

const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

export interface Preview {
  update(): void;
  setFileName(name: string | null): void;
  setSource(src: PreviewSource | null): void;
  destroy(): void;
}

export function initPreview(
  wrap: HTMLElement,
  area: HTMLTextAreaElement,
  onFormat?: (next: string) => void,
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

  head.append(title, invertBtn);

  const body = document.createElement("div");
  body.className = "preview-body";

  applyInvert();
  panel.append(head, body);
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
  let isMdFile = false;
  let source: PreviewSource | null = null;
  let sourceText = "";
  let pdfView: { destroy(): void } | null = null;
  let pdfAbort: AbortController | null = null;

  const renderMarkdown = (): void => {
    const text = area.value;
    const blocks = text.trim() ? parse(text) : [];
    body.innerHTML = blocks.length ? toHtml(blocks) : "";
    body.classList.toggle("is-empty", !blocks.length);

    tidied = null;
    const looksMd = isMdFile || isMarkdown(blocks);
    if (onFormat && looksMd && text.length <= TIDY_LIMIT) {
      const next = print(blocks);
      if (next !== text) tidied = next;
    }
    tidy.hidden = tidied === null;
  };

  const dropPdf = (): void => {
    pdfAbort?.abort();
    pdfAbort = null;
    pdfView?.destroy();
    pdfView = null;
  };

  const renderPdf = async (file: File): Promise<void> => {
    const controller = new AbortController();
    pdfAbort = controller;
    body.classList.remove("is-empty");
    body.replaceChildren();
    try {
      const mod = await import("./pdfview.ts");
      if (controller.signal.aborted) return;
      const view = await mod.renderPdfInto(body, file, controller.signal);
      if (controller.signal.aborted) {
        view.destroy();
        return;
      }
      pdfView = view;
    } catch {
      if (controller.signal.aborted) return;
      showNotice("PDF хуудсыг зурж чадсангүй");
    }
  };

  const update = (): void => {
    if (source) {
      if (!isSameDocument(area.value, sourceText)) setSource(null);
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
    body.replaceChildren(note);
    body.classList.remove("is-empty");
    panel.classList.add("is-blank");
  };

  const setSource = (next: PreviewSource | null): void => {
    source = next;
    tidy.hidden = true;
    dropPdf();

    panel.classList.remove("is-blank");

    if (!next) {
      title.textContent = HEAD_TEXT;
      panel.classList.remove("is-pdf");
      body.replaceChildren();
      renderMarkdown();
      return;
    }

    sourceText = area.value;
    const name = next.kind === "pdf" ? next.file.name : next.name;
    title.textContent = `${HEAD_TEXT} · ${name}`;
    panel.classList.toggle("is-pdf", next.kind === "pdf");

    if (next.kind === "pdf") {
      void renderPdf(next.file);
      return;
    }
    showNotice("Уг файлыг үзүүлэх боломжгүй");
  };

  tidy.addEventListener("mousedown", (event) => event.preventDefault());
  tidy.addEventListener("click", () => {
    if (onFormat && tidied !== null) onFormat(tidied);
  });

  area.addEventListener("input", update);
  update();

  const setFileName = (name: string | null): void => {
    isMdFile = MD_NAME.test(name ?? "");
    update();
  };

  return {
    update,
    setFileName,
    setSource,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      dropPdf();
      area.removeEventListener("input", update);
      tidy.remove();
      panel.remove();
    },
  };
}
