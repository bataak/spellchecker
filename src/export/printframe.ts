import { applyDataStyles } from "../core/htmlutil.ts";

const FRAME_CLASS = "print-frame";

function mountFrame(): HTMLIFrameElement {
  document.querySelector("iframe." + FRAME_CLASS)?.remove();
  const frame = document.createElement("iframe");
  frame.className = FRAME_CLASS;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  return frame;
}

export function printPdf(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([bytes], { type: "application/pdf" }),
  );
  const frame = mountFrame();
  const cleanup = (): void => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  return new Promise((resolve, reject) => {
    frame.addEventListener(
      "load",
      () => {
        const win = frame.contentWindow;
        if (!win) {
          cleanup();
          reject(new Error("print frame unavailable"));
          return;
        }
        try {
          win.focus();
          win.print();
        } catch {
          window.open(url, "_blank", "noopener");
        }
        resolve();
        setTimeout(cleanup, 60_000);
      },
      { once: true },
    );
    frame.src = url;
    document.body.appendChild(frame);
  });
}

export function splitStyles(html: string): { markup: string; css: string } {
  const open = html.indexOf("<style>");
  const close = open < 0 ? -1 : html.indexOf("</style>", open);
  if (close < 0) return { markup: html, css: "" };
  return {
    markup: html.slice(0, open) + html.slice(close + "</style>".length),
    css: html.slice(open + "<style>".length, close),
  };
}

export function printPage(html: string): Promise<void> {
  const frame = mountFrame();
  const { markup, css } = splitStyles(html);
  frame.srcdoc = markup;
  return new Promise((resolve, reject) => {
    frame.addEventListener(
      "load",
      () => {
        const win = frame.contentWindow as (Window & typeof globalThis) | null;
        const inner = frame.contentDocument;
        if (!win || !inner) {
          frame.remove();
          reject(new Error("print frame unavailable"));
          return;
        }
        const sheet = new win.CSSStyleSheet();
        sheet.replaceSync(css);
        inner.adoptedStyleSheets = [sheet];
        applyDataStyles(inner);
        win.addEventListener(
          "afterprint",
          () => {
            setTimeout(() => frame.remove(), 0);
          },
          { once: true },
        );
        void Promise.allSettled([
          ...[...inner.fonts].map((face) => face.load()),
          ...[...inner.images].map((img) => img.decode()),
        ])
          .then(() => inner.fonts.ready)
          .then(() => {
            win.focus();
            win.print();
            resolve();
          });
      },
      { once: true },
    );
    document.body.appendChild(frame);
  });
}
