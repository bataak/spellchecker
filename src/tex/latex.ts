import {
  blankEm,
  fitBlanks,
  headingClasses,
  isFigure,
  listTree,
  mathSource,
  metaValue,
  parseInline,
  safeHref,
  textLogos,
  withLogos,
  type Block,
  type DivBlock,
  type Inline,
} from "../markdown.ts";
import { splitSlides, type Slide } from "../doc/slides.ts";
import { attempt } from "../core/attempt.ts";
import { listLatex } from "./latexlist.ts";
import { tableLatex } from "./latextable.ts";
import { usesOverlay } from "./texbeamer.ts";
import { preambleFor } from "./latexpreamble.ts";
import { tableLook, type TableLook } from "../markdown/tablelook.ts";
import { LETTER_PAGE, letterTitle } from "./latexletter.ts";
import { escapeCode, escapeProse, guardBreak } from "./texescape.ts";
import { documentStart, literalTest, liveMatches } from "./texliteral.ts";
import { uncommented } from "./texproject.ts";

const TUGRIK = `\\DeclareRobustCommand\\texttugrik{\\leavevmode\\hbox{\\ooalign{Т\\cr
  \\hidewidth\\raisebox{0.42ex}{\\rotatebox{-22}{\\rule{0.42em}{0.09ex}}}\\hidewidth\\cr
  \\hidewidth\\raisebox{0.78ex}{\\rotatebox{-22}{\\rule{0.42em}{0.09ex}}}\\hidewidth\\cr}}}
`;

const UNICODE_FALLBACK = `\\makeatletter
\\def\\UTFviii@undefined@err#1{\\fbox{\\tiny ?}}
\\makeatother
`;

function exportExtras(tex: string, graphicx: boolean): string {
  return (
    (tex.includes("\\texttugrik")
      ? (graphicx ? "" : "\\usepackage{graphicx}\n") + TUGRIK
      : "") + UNICODE_FALLBACK
  );
}

const TEXT_FONTENC = /\\usepackage\[[^\]]*\b(?:T1|T2A)\b[^\]]*\]\{fontenc\}/;
const CYRILLIC_BABEL =
  /\\usepackage\[[^\]]*\b(?:mongolian|russian|ukrainian|bulgarian)\b[^\]]*\]\{babel\}/;
const FONT_PACKAGE =
  /\\usepackage(?:\[[^\]]*\])?\{(?:paratype|PTSerif|PTSans|cm-super|lmodern|tempora|fontspec)\}/;

const PREAMBLE_LINE = /^[ \t]*\\(?:usepackage|RequirePackage|makeindex)\b.*$/gm;
const DOCUMENT_CLASS = /\\documentclass\b/g;
const END_DOCUMENT = /\\end\s*\{document\}/g;

function fragmentParts(text: string): { head: string; body: string } {
  const begin = documentStart(text);
  if (begin) {
    const rest = text.slice(begin.index + begin[0].length);
    const end = liveMatches(rest, END_DOCUMENT)[0];
    return {
      head: text.slice(0, begin.index),
      body: end ? rest.slice(0, end.index) : rest,
    };
  }
  const literal = literalTest(text);
  const lines: string[] = [];
  const body = text.replace(PREAMBLE_LINE, (line: string, at: number) => {
    if (literal(at)) return line;
    lines.push(line);
    return "";
  });
  return { head: lines.join("\n"), body };
}

export function previewTex(text: string): string {
  if (liveMatches(text, DOCUMENT_CLASS).length) return text;
  const { head, body } = fragmentParts(text);
  return (
    preambleFor(head + "\n" + body) +
    "\n" +
    head.trim() +
    "\n\\begin{document}\n" +
    body +
    "\n\\end{document}\n"
  );
}

export function withParatype(text: string): string | null {
  const live = uncommented(text);
  if (FONT_PACKAGE.test(live)) return null;
  if (!TEXT_FONTENC.test(live) && !CYRILLIC_BABEL.test(live)) return null;
  const at = documentStart(text)?.index;
  if (at === undefined) return null;
  return text.slice(0, at) + "\\usepackage{paratype}\n" + text.slice(at);
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

const DISPLAY_ENV =
  /^\\begin\{(?:equation|align|gather|multline|flalign|alignat|displaymath)\*?\}/;

function oneLine(nodes: readonly Inline[]): string {
  return inline(
    nodes.map((n): Inline =>
      n.type === "break" ? { type: "text", value: " " } : n,
    ),
  );
}

export function texImagePath(src: string): string {
  return attempt(() => decodeURIComponent(src), src).replace(/[{}%#\\]/g, "_");
}

const LINE_BREAK = "\\\\\n";

function inlineNode(n: Inline): string {
  switch (n.type) {
    case "text":
      return withLogos(n.value, (name) => "\\" + name + "{}", escapeProse);
    case "code":
      return "\\texttt{" + escapeCode(n.value) + "}";
    case "strong":
      return "\\textbf{" + inline(n.children) + "}";
    case "em":
      return "\\emph{" + inline(n.children) + "}";
    case "math":
      return mathSource(n.open, textLogos(n.value));
    case "softbreak":
      return "\n";
    case "break":
      return LINE_BREAK;
    case "blank":
      return (
        "\\rule[-0.3ex]{" +
        String(
          n.fit === undefined
            ? n.width / 2
            : Math.round(blankEm(n) * 100) / 100,
        ) +
        "em}{0.4pt}"
      );
    case "del":
      return inline(n.children);
    case "image":
      return (
        "\\includegraphics[" +
        (n.rotate ? "angle=" + String(n.rotate) + "," : "") +
        "width=" +
        (n.width === undefined ? "" : String(n.width / 100)) +
        "\\linewidth,height=0.85\\textheight,keepaspectratio]{" +
        texImagePath(n.src) +
        "}"
      );
    default:
      if (!safeHref(n.url)) return inline(n.children);
      if (n.auto) return "\\url{" + escapeUrl(n.url) + "}";
      return "\\href{" + escapeUrl(n.url) + "}{" + inline(n.children) + "}";
  }
}

function inline(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    const text = inlineNode(n);
    out += out.endsWith(LINE_BREAK) ? guardBreak(text) : text;
  }
  return out;
}

function columnWidth(div: DivBlock, count: number): string {
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(div.keys["width"] ?? "")?.[1];
  const share = percent === undefined ? 1 / count : Number(percent) / 100;
  return String(Math.round(share * 0.96 * 1000) / 1000) + "\\textwidth";
}

function divBlock(b: DivBlock, beamer: boolean): string {
  const place = b.classes.includes("left")
    ? "\\raggedright"
    : b.classes.includes("center")
      ? "\\centering"
      : b.classes.some((name) => name === "right" || name === "signature")
        ? "\\raggedleft"
        : undefined;
  const look = tableLook(b.classes, b.keys);
  const body = (blocks: readonly Block[]): string =>
    blocks.map((inner) => block(inner, beamer, place, look)).join("\n\n");
  if (b.classes.includes("notes"))
    return beamer ? "\\note{" + body(noteBlocks(b.children)) + "}" : "";
  if (b.classes.includes("signature"))
    return (
      "\\bigskip\n\\begin{flushright}\n" +
      (b.children.some((inner) => inner.type === "paragraph")
        ? "\\linespread{1.25}\\selectfont\n"
        : "") +
      body(b.children) +
      "\n\\end{flushright}"
    );
  if (place !== undefined)
    return (
      "{\\setlength{\\parindent}{0pt}" +
      place +
      "\n" +
      body(b.children) +
      "\\par}"
    );
  if (!b.classes.includes("columns")) return body(b.children);
  const columns = b.children.filter(
    (inner): inner is DivBlock =>
      inner.type === "div" && inner.classes.includes("column"),
  );
  if (!columns.length) return body(b.children);
  if (beamer)
    return (
      "\\begin{columns}[T]\n" +
      columns
        .map(
          (column) =>
            "\\begin{column}{" +
            columnWidth(column, columns.length) +
            "}\n" +
            body(column.children) +
            "\n\\end{column}",
        )
        .join("\n") +
      "\n\\end{columns}"
    );
  return (
    "\\noindent\n" +
    columns
      .map(
        (column) =>
          "\\begin{minipage}[t]{" +
          columnWidth(column, columns.length) +
          "}\n" +
          body(column.children) +
          "\n\\end{minipage}",
      )
      .join("\\hfill\n")
  );
}

function codeLines(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      const code = line.trimStart();
      const indent = "~".repeat(line.length - code.length);
      return "\\texttt{" + indent + escapeCode(code) + "}\\\\";
    })
    .join("\n");
}

function codeLatex(value: string): string {
  if (!value.includes("\\end{verbatim}"))
    return "\\begin{verbatim}\n" + value + "\n\\end{verbatim}";
  return codeLines(value);
}

const VERBATIM_EDGES = /^\s*\\begin\{verbatim\}\n?|\n?\\end\{verbatim\}\s*$/g;

function noteBlocks(blocks: readonly Block[]): Block[] {
  return blocks.map((b): Block => {
    if (b.type === "codeblock")
      return {
        type: "latex",
        env: "",
        value: codeLines(b.value),
        line: b.line,
      };
    if (b.type === "latex" && b.env === "verbatim")
      return { ...b, value: codeLines(b.value.replace(VERBATIM_EDGES, "")) };
    return b.type === "div" || b.type === "quote"
      ? { ...b, children: noteBlocks(b.children) }
      : b;
  });
}

function block(
  b: Block,
  beamer = false,
  place?: string,
  look?: TableLook,
): string {
  switch (b.type) {
    case "heading": {
      const cmd = SECTION[Math.min(b.depth, SECTION.length) - 1]!;
      const star = headingClasses(b).includes("unnumbered") ? "*" : "";
      return "\\" + cmd + star + "{" + oneLine(b.children) + "}";
    }
    case "meta":
      return "";
    case "div":
      return divBlock(b, beamer);
    case "paragraph":
      return isFigure(b.children)
        ? "\\begin{center}\n" + inline(b.children).trim() + "\n\\end{center}"
        : inline(b.children);
    case "latex":
      return b.value;
    case "math":
      return DISPLAY_ENV.test(b.value)
        ? textLogos(b.value)
        : "\\[\n" + textLogos(b.value) + "\n\\]";
    case "rule":
      return "\\noindent\\rule{\\linewidth}{0.4pt}";
    case "pagebreak":
      return "\\newpage";
    case "codeblock":
      return codeLatex(b.value);
    case "quote":
      return (
        "\\begin{quote}\n" +
        b.children.map((inner) => block(inner, beamer)).join("\n\n") +
        "\n\\end{quote}"
      );
    case "list":
      return listLatex(listTree(b), inline, beamer);
    case "table":
      return tableLatex(b, inline, { place, look });
  }
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
    .map((b) => block(b))
    .filter((text) => text !== "")
    .join("\n\n");
}

function metaText(value: string | undefined): string | null {
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

const NOTES_SCREEN = `\\usepackage{pgfpages}
\\setbeameroption{show notes on second screen=right}
`;

function hasVerbatim(blocks: readonly Block[]): boolean {
  return blocks.some((b) => {
    if (b.type === "codeblock") return true;
    if (b.type === "latex") return b.env === "verbatim";
    return (b.type === "div" || b.type === "quote") && hasVerbatim(b.children);
  });
}

function hasOverlay(blocks: readonly Block[]): boolean {
  return blocks.some((b) => {
    if (b.type === "latex") return usesOverlay(b.value);
    return (b.type === "div" || b.type === "quote") && hasOverlay(b.children);
  });
}

function frame(slide: Slide): string {
  if (slide.section)
    return (
      "\\section{" +
      oneLine(slide.title ?? []) +
      "}\n\\begin{frame}\n\\sectionpage\n\\end{frame}"
    );
  const fragile = hasVerbatim(slide.blocks)
    ? hasOverlay(slide.blocks)
      ? "[fragile]"
      : "[fragile=singleslide]"
    : "";
  const body = slide.blocks
    .map((b) =>
      b.type === "heading"
        ? "\\textbf{" + oneLine(b.children) + "}\\par"
        : block(b, true),
    )
    .filter((text) => text !== "")
    .join("\n\n");
  const notes = slide.notes.length
    ? "\n\\note{" +
      noteBlocks(slide.notes)
        .map((b) => block(b, true))
        .join("\n\n") +
      "}"
    : "";
  return (
    "\\begin{frame}" +
    fragile +
    (slide.title === null ? "" : "{" + oneLine(slide.title) + "}") +
    "\n" +
    body +
    notes +
    "\n\\end{frame}"
  );
}

export interface BeamerOptions {
  readonly notesScreen?: boolean;
}

export function toBeamer(
  blocks: readonly Block[],
  preamble: string = BEAMER_PREAMBLE,
  options: BeamerOptions = {},
): string {
  const deck = splitSlides(blocks);
  const parts = [
    preamble.replace(/\s*$/, "\n") + (options.notesScreen ? NOTES_SCREEN : ""),
  ];
  if (deck.title !== null) {
    let head = "\\title{" + oneLine(deck.title) + "}\n";
    if (deck.subtitle.length)
      head += "\\subtitle{" + deck.subtitle.map(inline).join(" \\\\ ") + "}\n";
    const author = metaText(deck.meta.author);
    const institute = metaText(deck.meta.institute);
    const date = metaText(deck.meta.date);
    if (author !== null) head += "\\author{" + author + "}\n";
    if (institute !== null) head += "\\institute{" + institute + "}\n";
    if (date !== null) head += "\\date{" + date + "}\n";
    parts.push(head);
  }
  parts.push("\\begin{document}\n");
  if (deck.title !== null)
    parts.push("\\begin{frame}\n\\titlepage\n\\end{frame}\n");
  for (const slide of deck.slides) parts.push(frame(slide) + "\n");
  parts.push("\\end{document}\n");
  if (preamble === BEAMER_PREAMBLE)
    parts.splice(1, 0, exportExtras(parts.slice(1).join("\n"), true));
  return parts.join("\n");
}
