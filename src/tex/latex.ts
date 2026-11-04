import { fitBlanks, metaValue, parseInline, type Block } from "../markdown.ts";
import { preambleFor } from "./latexpreamble.ts";
import { LETTER_PAGE, letterTitle } from "./latexletter.ts";
import { oneLine, inline } from "./latexinline.ts";
import { block, ARTICLE_BLOCK } from "./latexblocks.ts";

const TUGRIK = `\\DeclareRobustCommand\\texttugrik{\\leavevmode\\hbox{\\ooalign{Т\\cr
  \\hidewidth\\raisebox{0.42ex}{\\rotatebox{-22}{\\rule{0.42em}{0.09ex}}}\\hidewidth\\cr
  \\hidewidth\\raisebox{0.78ex}{\\rotatebox{-22}{\\rule{0.42em}{0.09ex}}}\\hidewidth\\cr}}}
`;

const UNICODE_FALLBACK = `\\makeatletter
\\def\\UTFviii@undefined@err#1{\\fbox{\\tiny ?}}
\\makeatother
`;

export function exportExtras(tex: string, graphicx: boolean): string {
  return (
    (tex.includes("\\sout{") ? "\\usepackage[normalem]{ulem}\n" : "") +
    (tex.includes("\\texttugrik")
      ? (graphicx ? "" : "\\usepackage{graphicx}\n") + TUGRIK
      : "") +
    UNICODE_FALLBACK
  );
}

function headingDepths(blocks: readonly Block[]): number[] {
  return blocks.flatMap((b) =>
    b.type === "heading"
      ? [b.depth]
      : b.type === "div" || b.type === "quote"
        ? headingDepths(b.children)
        : [],
  );
}

function liftHeadings(blocks: readonly Block[], by: number): Block[] {
  return blocks.map((b): Block => {
    if (b.type === "heading") return { ...b, depth: b.depth - by };
    if (b.type === "div" || b.type === "quote")
      return { ...b, children: liftHeadings(b.children, by) };
    return b;
  });
}

export function toLatexBody(blocks: readonly Block[]): string {
  const top = Math.min(...headingDepths(blocks));
  const lifted =
    top > 1 && top < Infinity ? liftHeadings(blocks, top - 1) : blocks;
  return fitBlanks(lifted)
    .map((b) => block(b, ARTICLE_BLOCK))
    .filter((text) => text !== "")
    .join("\n\n");
}

export function metaText(value: string | undefined): string | null {
  return value === undefined ? null : inline(parseInline(value));
}

function titleBlock(head: Block | undefined): string {
  const title = metaText(metaValue(head, "title"));
  if (title === null) return "";
  const subtitle = metaText(metaValue(head, "subtitle"));
  const author = [metaValue(head, "author"), metaValue(head, "institute")]
    .map(metaText)
    .filter((part): part is string => part !== null)
    .join(" \\\\ ");
  const date = metaText(metaValue(head, "date"));
  return (
    "\\title{" +
    title +
    (subtitle === null ? "" : " \\\\[0.5ex] \\large " + subtitle) +
    "}\n\\author{" +
    author +
    "}\n\\date{" +
    (date ?? "") +
    "}\n"
  );
}

export interface LatexOptions {
  readonly toc?: boolean;
  readonly pageNumbers?: boolean;
  readonly letter?: boolean;
}

export function toLatex(
  blocks: readonly Block[],
  preamble?: string,
  options: LatexOptions = {},
): string {
  if (options.letter) blocks = letterTitle(blocks, oneLine);
  const head = titleBlock(blocks[0]);
  const plain = options.pageNumbers !== false;
  const body = toLatexBody(blocks);
  const base =
    preamble ??
    preambleFor(head + body) + (options.letter ? "\n" + LETTER_PAGE : "");
  const top = base.replace(/\s*$/, "\n");
  return (
    top +
    (preamble === undefined
      ? exportExtras(head + body, top.includes("{graphicx}"))
      : "") +
    head +
    "\n\\begin{document}\n\n" +
    (plain ? "" : "\\pagestyle{empty}\n\n") +
    (head ? "\\maketitle\n\n" : "") +
    (head && !plain ? "\\thispagestyle{empty}\n\n" : "") +
    (options.toc ? "\\tableofcontents\n\n" : "") +
    body +
    "\n\n\\end{document}\n"
  );
}

export const BEAMER_PREAMBLE = `\\documentclass[aspectratio=169]{beamer}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[mongolian]{babel}
\\usepackage{paratype}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage[OT1]{eulervm}
\\usepackage{graphicx}
\\usepackage{listings}
\\usefonttheme[onlymath]{serif}
\\deftranslation[to=mongolian]{Theorem}{Теорем}
\\deftranslation[to=mongolian]{Definition}{Тодорхойлолт}
\\deftranslation[to=mongolian]{Section}{Бүлэг}
\\deftranslation[to=mongolian]{Subsection}{Дэд бүлэг}
`;
