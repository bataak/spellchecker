import { applyDataStyles } from "../core/htmlutil.ts";
import { fitBlanks, parse, toHtml, type Block } from "../markdown.ts";
import { resolveImages } from "./mdimages.ts";

export interface MarkdownView {
  render(text: string, refresh: () => void): readonly Block[];
  clear(): void;
  shown(): boolean;
}

export function createMarkdownView(body: HTMLElement): MarkdownView {
  let shownHtml: string | null = null;
  let mathView: typeof import("./mathview.ts") | null = null;

  const renderMath = (next: HTMLElement): void => {
    if (!next.querySelector(".math")) return;
    if (mathView) mathView.renderMath(next);
    else
      void import("./mathview.ts")
        .then((mod) => {
          mathView = mod;
          mod.renderMath(body);
        })
        .catch(() => undefined);
  };

  return {
    render(text, refresh) {
      const blocks = text.trim() ? parse(text) : [];
      const html = blocks.length ? toHtml(fitBlanks(blocks)) : "";
      if (html !== shownHtml) {
        shownHtml = html;
        const next = document.createElement("div");
        next.innerHTML = html;
        applyDataStyles(next);
        resolveImages(next);
        renderMath(next);
        body.replaceChildren(...next.childNodes);
        refresh();
      }
      body.classList.toggle("is-empty", !blocks.length);
      return blocks;
    },
    clear() {
      shownHtml = null;
    },
    shown: () => !!shownHtml,
  };
}
