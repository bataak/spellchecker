/**
 * Markdown → LaTeX.
 *
 * `markdown.ts`-ийн модноос шууд `.tex` бичвэр үүсгэнэ. Хөрвүүлэлт
 * (pdflatex) хэрэглэгчийн талд хийгдэнэ — энд зөвхөн эх код.
 */

import type { Block, Inline } from "./markdown.ts";

/** pdflatex-д зориулсан анхдагч толгой. */
export const PREAMBLE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[mongolian]{babel}
\\usepackage[normalem]{ulem}
\\usepackage{hyperref}
`;

const SPECIAL: Readonly<Record<string, string>> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "%": "\\%",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export function escapeTex(s: string): string {
  return s.replace(/[\\{}$&%#_~^]/g, (c) => SPECIAL[c]!);
}

/** `\href`, `\url`-ийн аргументэд зөвхөн эдгээрийг хамгаална. */
function escapeUrl(url: string): string {
  return url.replace(/[\\{}%#]/g, (c) => "\\" + c);
}

const SECTION = [
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
];

const COLUMN = { left: "l", center: "c", right: "r" } as const;

function inline(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") out += escapeTex(n.value);
    else if (n.type === "code") out += "\\texttt{" + escapeTex(n.value) + "}";
    else if (n.type === "strong") out += "\\textbf{" + inline(n.children) + "}";
    else if (n.type === "em") out += "\\emph{" + inline(n.children) + "}";
    else if (n.type === "del") out += "\\sout{" + inline(n.children) + "}";
    else if (n.auto) out += "\\url{" + escapeUrl(n.url) + "}";
    else
      out +=
        "\\href{" + escapeUrl(n.url) + "}{" + inline(n.children) + "}";
  }
  return out;
}

function block(b: Block): string {
  switch (b.type) {
    case "heading": {
      const cmd = SECTION[Math.min(b.depth, SECTION.length) - 1]!;
      return "\\" + cmd + "{" + inline(b.children) + "}";
    }
    case "paragraph":
      return inline(b.children);
    case "rule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}";
    case "codeblock":
      // verbatim дотор `\end{verbatim}` байвал орчин эрт хаагдана.
      if (!b.value.includes("\\end{verbatim}"))
        return "\\begin{verbatim}\n" + b.value + "\n\\end{verbatim}";
      return b.value
        .split("\n")
        .map((line) => "\\texttt{" + escapeTex(line) + "}\\\\")
        .join("\n");
    case "quote":
      return (
        "\\begin{quote}\n" +
        b.children.map(block).join("\n\n") +
        "\n\\end{quote}"
      );
    case "list": {
      const env = b.ordered ? "enumerate" : "itemize";
      const start =
        b.ordered && b.start !== 1
          ? "\\setcounter{enumi}{" + String(b.start - 1) + "}\n"
          : "";
      return (
        "\\begin{" +
        env +
        "}\n" +
        start +
        b.items.map((it) => "  \\item " + inline(it)).join("\n") +
        "\n\\end{" +
        env +
        "}"
      );
    }
    case "table": {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      const spec = Array.from({ length: width }, (_, i) => {
        const a = b.align[i];
        return a ? COLUMN[a] : "l";
      }).join("|");
      const row = (r: readonly Inline[][]): string =>
        Array.from({ length: width }, (_, i) => inline(r[i] ?? [])).join(
          " & ",
        ) + " \\\\";
      const [head, ...body] = b.rows;
      return [
        "\\begin{center}",
        "\\begin{tabular}{|" + spec + "|}",
        "\\hline",
        row(head ?? []),
        "\\hline",
        ...body.map(row),
        "\\hline",
        "\\end{tabular}",
        "\\end{center}",
      ].join("\n");
    }
  }
}

/** Баримтын бие — толгойгүй, `\begin{document}`-гүй. */
export function toLatexBody(blocks: readonly Block[]): string {
  return blocks.map(block).join("\n\n");
}

export function toLatex(
  blocks: readonly Block[],
  preamble: string = PREAMBLE,
): string {
  return (
    preamble.replace(/\s*$/, "\n") +
    "\n\\begin{document}\n\n" +
    toLatexBody(blocks) +
    "\n\n\\end{document}\n"
  );
}
