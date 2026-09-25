import type { Block, Inline } from "./markdown.ts";

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
    else out += "\\href{" + escapeUrl(n.url) + "}{" + inline(n.children) + "}";
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

export const BEAMER_PREAMBLE = `\\documentclass{beamer}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[mongolian]{babel}
\\usepackage[normalem]{ulem}
`;

interface Slide {
  title: string | null;
  blocks: Block[];
}

function frame(slide: Slide): string {
  const fragile = slide.blocks.some((b) => b.type === "codeblock");
  const body = slide.blocks
    .map((b) =>
      b.type === "heading"
        ? "\\textbf{" + inline(b.children) + "}\\par"
        : block(b),
    )
    .join("\n\n");
  return (
    "\\begin{frame}" +
    (fragile ? "[fragile]" : "") +
    (slide.title === null ? "" : "{" + slide.title + "}") +
    "\n" +
    body +
    "\n\\end{frame}"
  );
}

export function toBeamer(
  blocks: readonly Block[],
  preamble: string = BEAMER_PREAMBLE,
): string {
  let title: string | null = null;
  const slides: Slide[] = [];
  let current: Slide | null = null;

  for (const b of blocks) {
    if (
      b.type === "heading" &&
      b.depth === 1 &&
      title === null &&
      !slides.length
    ) {
      title = inline(b.children);
      continue;
    }
    if (b.type === "heading" && b.depth <= 2) {
      current = { title: inline(b.children), blocks: [] };
      slides.push(current);
      continue;
    }
    if (b.type === "rule") {
      current = { title: null, blocks: [] };
      slides.push(current);
      continue;
    }
    if (current === null) {
      current = { title: null, blocks: [] };
      slides.push(current);
    }
    current.blocks.push(b);
  }

  const parts = [preamble.replace(/\s*$/, "\n")];
  if (title !== null) parts.push("\\title{" + title + "}\n");
  parts.push("\\begin{document}\n");
  if (title !== null) parts.push("\\begin{frame}\n\\titlepage\n\\end{frame}\n");
  for (const slide of slides) parts.push(frame(slide) + "\n");
  parts.push("\\end{document}\n");
  return parts.join("\n");
}
