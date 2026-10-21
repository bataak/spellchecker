import { loadInvert, saveInvert, ZOOM_MAX, ZOOM_MIN } from "./viewprefs.ts";

export const HEAD_TEXT = "Харагдац";

const SVG_NS = "http://www.w3.org/2000/svg";

function strokeGlyph(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "tex-compile-glyph");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
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

function headButton(
  className: string,
  label: string,
  content: string | Node,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  if (className) button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(content);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

export type ZoomAction = "out" | "in" | "reset";

export interface PreviewHeadHandlers {
  readonly onZoom: (action: ZoomAction) => void;
  readonly onGoTo: (page: number) => void;
  readonly canNavigate: () => boolean;
}

export interface PreviewHead {
  readonly head: HTMLElement;
  readonly title: HTMLElement;
  readonly compileBtn: HTMLButtonElement;
  readonly downloadBtn: HTMLButtonElement;
  showZoom(zoom: number): void;
  showPage(page: number, total: number): void;
  closePageInput(): void;
}

function invertButton(panel: HTMLElement): HTMLButtonElement {
  let invert = loadInvert();
  const button = headButton(
    "pdf-invert",
    "Хуудсыг цагаанаар харах",
    contrastGlyph(),
  );
  const apply = (): void => {
    panel.classList.toggle("no-invert", !invert);
    button.setAttribute("aria-pressed", String(!invert));
  };
  button.addEventListener("click", () => {
    invert = !invert;
    saveInvert(invert);
    apply();
  });
  apply();
  return button;
}

function zoomControls(handlers: PreviewHeadHandlers) {
  const box = document.createElement("span");
  box.className = "pdf-zoom";
  const out = headButton("", "Жижгэрүүлэх", "−");
  const reset = headButton("pdf-zoom-level", "Анхны хэмжээ", "100%");
  const zoomIn = headButton("", "Томруулах", "+");
  box.append(out, reset, zoomIn);
  out.addEventListener("click", () => handlers.onZoom("out"));
  zoomIn.addEventListener("click", () => handlers.onZoom("in"));
  reset.addEventListener("click", () => handlers.onZoom("reset"));
  return { box, out, reset, zoomIn };
}

export function buildPreviewHead(
  panel: HTMLElement,
  handlers: PreviewHeadHandlers,
): PreviewHead {
  const head = document.createElement("div");
  head.className = "preview-head";

  const title = document.createElement("span");
  title.className = "preview-title";
  title.textContent = HEAD_TEXT;

  const invertBtn = invertButton(panel);
  const zoom = zoomControls(handlers);

  const pageNav = document.createElement("span");
  pageNav.className = "pdf-page-nav";
  const pageLabel = document.createElement("button");
  pageLabel.type = "button";
  pageLabel.className = "pdf-page-label";
  pageLabel.title = "Хуудас уруу очих";
  const pageInput = document.createElement("input");
  pageInput.type = "text";
  pageInput.inputMode = "numeric";
  pageInput.className = "pdf-page-input";
  pageInput.setAttribute("aria-label", "Хуудасны дугаар");
  pageInput.hidden = true;
  pageNav.append(pageLabel, pageInput);

  let page = 1;
  let pages = 0;
  const closePageInput = (): void => {
    if (pageInput.hidden) return;
    pageInput.hidden = true;
    pageLabel.hidden = false;
  };
  pageLabel.addEventListener("click", () => {
    if (!handlers.canNavigate()) return;
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
    if (Number.isFinite(target)) handlers.onGoTo(target);
    closePageInput();
    pageLabel.focus();
  });
  pageInput.addEventListener("blur", closePageInput);

  const compileBtn = headButton(
    "tex-compile",
    "Хөрвүүлэх",
    strokeGlyph(["M13 8a5 5 0 1 1-1.46-3.54", "M13 2.5V5.5H10"]),
  );
  const downloadBtn = headButton(
    "tex-compile tex-download",
    "PDF татах",
    strokeGlyph(["M8 2.5v8", "M4.5 7 8 10.5 11.5 7", "M3 13.5h10"]),
  );
  downloadBtn.disabled = true;

  head.append(title, pageNav, compileBtn, downloadBtn, zoom.box, invertBtn);

  return {
    head,
    title,
    compileBtn,
    downloadBtn,
    showZoom(level) {
      zoom.reset.textContent = Math.round(level * 100) + "%";
      zoom.out.disabled = level <= ZOOM_MIN;
      zoom.zoomIn.disabled = level >= ZOOM_MAX;
    },
    showPage(next, total) {
      page = next;
      pages = total;
      pageLabel.textContent = page + " / " + pages;
      pageLabel.setAttribute(
        "aria-label",
        "Хуудас " + page + " / " + pages + ". Хуудас уруу очих",
      );
    },
    closePageInput,
  };
}
