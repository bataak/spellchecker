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
  type ListTree,
} from "../markdown.ts";
import { splitSlides, type Slide } from "../doc/slides.ts";
import { attempt } from "../core/attempt.ts";
import { tableLatex } from "./latextable.ts";
import { tableLook, type TableLook } from "../markdown/tablelook.ts";
import { LETTER_PAGE, letterTitle } from "./latexletter.ts";
import { escapeTex } from "./texescape.ts";

const BASE_PREAMBLE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[mongolian]{babel}
\\usepackage{paratype}
`;

const MATH_RE =
  /(?<!\\)\$|(?<!\\)\\[[(]|\\begin\{(?:math|displaymath|equation|align|gather|multline|flalign)\b/;

export function preambleFor(tex: string): string {
  const math = MATH_RE.test(tex);
  const theorem = tex.includes("\\begin{theorem}");
  const definition = tex.includes("\\begin{definition}");
  const lines = [
    math && "\\usepackage{amsmath}",
    (math || /\\(?:checkmark|mathbb)\b/.test(tex)) && "\\usepackage{amssymb}",
    tex.includes("\\arraybackslash") && "\\usepackage{array}",
    tex.includes("\\toprule") && "\\usepackage{booktabs}",
    tex.includes("\\includegraphics") && "\\usepackage{graphicx}",
    math && "\\usepackage[OT1]{eulervm}",
    (theorem || definition || tex.includes("\\begin{proof}")) &&
      "\\usepackage{amsthm}",
    /\\(?:href|url)\{/.test(tex) && "\\usepackage{hyperref}",
    theorem && "\\newtheorem{theorem}{Теорем}",
    definition && "\\theoremstyle{definition}",
    definition && "\\newtheorem{definition}{Тодорхойлолт}",
  ];
  return (
    BASE_PREAMBLE + lines.filter((line) => typeof line === "string").join("\n")
  );
}

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

export function previewTex(text: string): string {
  if (/\\documentclass\b/.test(text)) return text;
  const begin = text.search(/\\begin\{document\}/);
  let head: string;
  let body: string;
  if (begin >= 0) {
    head = text.slice(0, begin);
    body = text
      .slice(begin + "\\begin{document}".length)
      .replace(/\\end\{document\}[\s\S]*$/, "");
  } else {
    head = (text.match(PREAMBLE_LINE) ?? []).join("\n");
    body = text.replace(PREAMBLE_LINE, "");
  }
  return (
    preambleFor(body) +
    "\n" +
    head.trim() +
    "\n\\begin{document}\n" +
    body +
    "\n\\end{document}\n"
  );
}

export function withParatype(text: string): string | null {
  if (FONT_PACKAGE.test(text)) return null;
  if (!TEXT_FONTENC.test(text) && !CYRILLIC_BABEL.test(text)) return null;
  const at = text.search(/\\begin\{document\}/);
  if (at < 0) return null;
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

const ENUM_COUNTERS = ["enumi", "enumii", "enumiii", "enumiv"];

function listLatex(tree: ListTree, depth: number): string {
  const env = tree.ordered ? "enumerate" : "itemize";
  const pad = "  ".repeat(depth);
  const counter = ENUM_COUNTERS[depth];
  const start =
    tree.ordered && tree.start !== 1 && counter
      ? pad + "\\setcounter{" + counter + "}{" + String(tree.start - 1) + "}\n"
      : "";
  const items = tree.entries.map(({ item, sub }) => {
    const text = inline(item);
    const guard = text.startsWith("[") ? "{}" : "";
    return (
      pad +
      "  \\item " +
      guard +
      text +
      (sub ? "\n" + listLatex(sub, depth + 1) : "")
    );
  });
  return (
    pad +
    "\\begin{" +
    env +
    "}\n" +
    start +
    items.join("\n") +
    "\n" +
    pad +
    "\\end{" +
    env +
    "}"
  );
}

function inline(nodes: readonly Inline[]): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text")
      out += withLogos(n.value, (name) => "\\" + name + "{}", escapeTex);
    else if (n.type === "code") out += "\\texttt{" + escapeTex(n.value) + "}";
    else if (n.type === "strong") out += "\\textbf{" + inline(n.children) + "}";
    else if (n.type === "em") out += "\\emph{" + inline(n.children) + "}";
    else if (n.type === "math") out += mathSource(n.open, textLogos(n.value));
    else if (n.type === "softbreak") out += "\n";
    else if (n.type === "break") out += "\\\\\n";
    else if (n.type === "blank" && n.fit !== undefined)
      out +=
        "\\rule[-0.3ex]{" +
        String(Math.round(blankEm(n) * 100) / 100) +
        "em}{0.4pt}";
    else if (n.type === "blank")
      out += "\\rule[-0.3ex]{" + String(n.width / 2) + "em}{0.4pt}";
    else if (n.type === "del") out += inline(n.children);
    else if (n.type === "image")
      out +=
        "\\includegraphics[" +
        (n.rotate ? "angle=" + String(n.rotate) + "," : "") +
        "width=" +
        (n.width === undefined ? "" : String(n.width / 100)) +
        "\\linewidth,height=0.85\\textheight,keepaspectratio]{" +
        texImagePath(n.src) +
        "}";
    else if (!safeHref(n.url)) out += inline(n.children);
    else if (n.auto) out += "\\url{" + escapeUrl(n.url) + "}";
    else out += "\\href{" + escapeUrl(n.url) + "}{" + inline(n.children) + "}";
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
    return beamer ? "\\note{" + body(b.children) + "}" : "";
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

function codeLatex(value: string): string {
  if (!value.includes("\\end{verbatim}"))
    return "\\begin{verbatim}\n" + value + "\n\\end{verbatim}";
  return value
    .split("\n")
    .map((line) => "\\texttt{" + escapeTex(line) + "}\\\\")
    .join("\n");
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
      return listLatex(listTree(b), 0);
    case "table":
      return tableLatex(b, inline, place, look);
  }
}

export function toLatexBody(blocks: readonly Block[]): string {
  return fitBlanks(blocks)
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

function frame(slide: Slide): string {
  if (slide.section)
    return (
      "\\section{" +
      oneLine(slide.title ?? []) +
      "}\n\\begin{frame}\n\\sectionpage\n\\end{frame}"
    );
  const fragile = slide.blocks.some(
    (b) =>
      b.type === "codeblock" || (b.type === "latex" && b.env === "verbatim"),
  );
  const body = slide.blocks
    .map((b) =>
      b.type === "heading"
        ? "\\textbf{" + oneLine(b.children) + "}\\par"
        : block(b, true),
    )
    .filter((text) => text !== "")
    .join("\n\n");
  const notes = slide.notes.length
    ? "\n\\note{" + slide.notes.map((b) => block(b, true)).join("\n\n") + "}"
    : "";
  return (
    "\\begin{frame}" +
    (fragile ? "[fragile]" : "") +
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
