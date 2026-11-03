import {
  type DivBlock,
  type Block,
  headingClasses,
  isFigure,
  textLogos,
  listTree,
} from "../markdown.ts";
import { type TableLook, tableLook } from "../markdown/tablelook.ts";
import { escapeCode } from "./texescape.ts";
import { MAX_NESTED_QUOTES, listLatex } from "./latexlist.ts";
import { oneLine, inline } from "./latexinline.ts";
import { tableLatex } from "./latextable.ts";

const SECTION = [
  "section",
  "subsection",
  "subsubsection",
  "paragraph",
  "subparagraph",
];

const DISPLAY_ENV =
  /^\\begin\{(?:equation|align|gather|multline|flalign|alignat|displaymath)\*?\}/;

function columnWidth(div: DivBlock, count: number): string {
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(div.keys["width"] ?? "")?.[1];
  const share = percent === undefined ? 1 / count : Number(percent) / 100;
  return String(Math.round(share * 0.96 * 1000) / 1000) + "\\textwidth";
}

interface BlockContext {
  readonly beamer: boolean;
  readonly envs: number;
  readonly place?: string;
  readonly look?: TableLook;
}

export const ARTICLE_BLOCK: BlockContext = { beamer: false, envs: 0 };

export const BEAMER_BLOCK: BlockContext = { beamer: true, envs: 0 };

function divBlock(b: DivBlock, outer: BlockContext): string {
  const { beamer } = outer;
  const place = b.classes.includes("left")
    ? "\\raggedright"
    : b.classes.includes("center")
      ? "\\centering"
      : b.classes.some((name) => name === "right" || name === "signature")
        ? "\\raggedleft"
        : undefined;
  const look = tableLook(b.classes, b.keys);
  const inner: BlockContext = { beamer, envs: outer.envs, place, look };
  const body = (blocks: readonly Block[], context = inner): string =>
    blocks.map((child) => block(child, context)).join("\n\n");
  if (b.classes.includes("notes"))
    return beamer ? "\\note{" + body(noteBlocks(b.children)) + "}" : "";
  if (b.classes.includes("signature"))
    return (
      "\\bigskip\n\\begin{flushright}\n" +
      (b.children.some((inner) => inner.type === "paragraph")
        ? "\\linespread{1.25}\\selectfont\n"
        : "") +
      body(b.children, { ...inner, envs: outer.envs + 1 }) +
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

export function noteBlocks(blocks: readonly Block[]): Block[] {
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

function quoteLatex(children: readonly Block[], outer: BlockContext): string {
  const { beamer, envs } = outer;
  const fits = envs < MAX_NESTED_QUOTES;
  const content = children
    .map((child) => block(child, { beamer, envs: fits ? envs + 1 : envs }))
    .join("\n\n");
  return fits ? "\\begin{quote}\n" + content + "\n\\end{quote}" : content;
}

export function block(b: Block, context: BlockContext): string {
  switch (b.type) {
    case "heading": {
      const cmd = SECTION[Math.min(b.depth, SECTION.length) - 1]!;
      const star = headingClasses(b).includes("unnumbered") ? "*" : "";
      return "\\" + cmd + star + "{" + oneLine(b.children) + "}";
    }
    case "meta":
      return "";
    case "div":
      return divBlock(b, context);
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
      return quoteLatex(b.children, context);
    case "list":
      return listLatex(listTree(b), inline, context.beamer, context.envs);
    case "table":
      return tableLatex(b, inline, {
        place: context.place,
        look: context.look,
      });
  }
}
