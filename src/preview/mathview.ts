import katex from "katex";
import "katex/dist/katex.min.css";

const CACHE_LIMIT = 500;

const cache = new Map<string, HTMLElement>();

function rendered(tex: string, display: boolean): HTMLElement {
  const key = (display ? "D" : "I") + tex;
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const holder = document.createElement("span");
  katex.render(
    tex
      .replace(/\\(begin|end)\{multline(\*?)\}/g, "\\$1{gather$2}")
      .replace(/\\(?:begin|end)\{displaymath\}/g, ""),
    holder,
    { displayMode: display, throwOnError: false },
  );
  cache.set(key, holder);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return holder;
}

export function renderMath(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(
    ".math:not([data-tex])",
  )) {
    const tex = el.textContent ?? "";
    el.dataset.tex = tex;
    const holder = rendered(tex, el.classList.contains("math-display"));
    el.replaceChildren(
      ...[...holder.childNodes].map((node) => node.cloneNode(true)),
    );
  }
}
