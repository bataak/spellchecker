import katex from "katex";
import "katex/dist/katex.min.css";

export function renderMath(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(
    ".math:not([data-tex])",
  )) {
    const tex = el.textContent ?? "";
    el.dataset.tex = tex;
    katex.render(
      tex
        .replace(/\\(begin|end)\{multline(\*?)\}/g, "\\$1{gather$2}")
        .replace(/\\(?:begin|end)\{displaymath\}/g, ""),
      el,
      {
        displayMode: el.classList.contains("math-display"),
        throwOnError: false,
      },
    );
  }
}
