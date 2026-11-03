import type { DocIr, ImageSet, IrBlock, IrRun, ParaStyle } from "./docir.ts";
import { listTree, type ListTree } from "../markdown.ts";
import { odfFont } from "./fonts.ts";
import { escapeAttr } from "../core/htmlutil.ts";
import { cm } from "./units.ts";
import { family, fontFaces } from "./printfonts.ts";
import { TEXT_ALIGN, className, verbatimPara, para } from "./printruns.ts";
import { tableHtml, strokeCss } from "./printtable.ts";

const LINE_RATIO = 1.15;

const PRINT_FAMILY: Readonly<Record<string, string>> = {
  "Times New Roman": "Bichig Print Serif",
  Arial: "Bichig Print Sans",
  "Courier New": "Bichig Print Mono",
};

function serifStack(base: string): string {
  return [PRINT_FAMILY[base] ?? base, base, odfFont(base), "Bichig Serif"]
    .filter((name, index, list) => list.indexOf(name) === index)
    .map(family)
    .concat("serif")
    .join(", ");
}

const MONO_STACK = [
  "Bichig Print Mono",
  "Courier New",
  odfFont("Courier New"),
  "Bichig Mono",
]
  .map(family)
  .concat("monospace")
  .join(", ");

function styleCss(style: ParaStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push("text-align:" + TEXT_ALIGN[style.align]);
  if (style.lineHeightPercent !== undefined)
    parts.push(
      "line-height:" +
        ((style.lineHeightPercent / 100) * LINE_RATIO).toFixed(3),
    );
  if (style.firstLineIndentCm !== undefined)
    parts.push("text-indent:" + cm(style.firstLineIndentCm));
  if (style.marginLeftCm !== undefined)
    parts.push("margin-left:" + cm(style.marginLeftCm));
  if (style.marginRightCm !== undefined)
    parts.push("margin-right:" + cm(style.marginRightCm));
  if (style.spaceBeforePt !== undefined)
    parts.push("margin-top:" + String(style.spaceBeforePt) + "pt");
  if (style.spaceAfterPt !== undefined)
    parts.push("margin-bottom:" + String(style.spaceAfterPt) + "pt");
  if (style.breakBefore) parts.push("break-before:page");
  if (style.keepWithNext) parts.push("break-after:avoid");
  if (style.borderBottom)
    parts.push("border-bottom:0.5pt solid #000", "padding-bottom:2pt");
  if (style.sizePt !== undefined)
    parts.push("font-size:" + String(style.sizePt) + "pt");
  if (style.bold) parts.push("font-weight:bold");
  if (style.italic) parts.push("font-style:italic");
  if (style.mono) parts.push("font-family:" + MONO_STACK);
  if (style.noHyphenation) parts.push("hyphens:manual");
  return parts.join(";");
}

function blockHtml(block: IrBlock, doc: DocIr, images: ImageSet): string {
  switch (block.kind) {
    case "para":
      return block.verbatim
        ? verbatimPara(block.style, block.runs, images)
        : para(block.style, block.runs, images);

    case "list": {
      const render = (tree: ListTree<readonly IrRun[]>): string => {
        const tag = tree.ordered ? "ol" : "ul";
        const start =
          tree.ordered && tree.start !== 1
            ? ' start="' + String(tree.start) + '"'
            : "";
        return (
          "<" +
          tag +
          start +
          ">" +
          tree.entries
            .map(
              ({ item, sub }) =>
                "<li>" +
                para(block.style, item, images) +
                (sub ? render(sub) : "") +
                "</li>",
            )
            .join("") +
          "</" +
          tag +
          ">"
        );
      };
      return render(listTree(block));
    }

    case "table":
      return tableHtml(block, doc, images);

    case "rule":
      return '<p class="rule"></p>';

    case "break":
      return '<p class="page-break"></p>';
  }
}

const BLOCK_CSS =
  "p{margin:0;orphans:2;widows:2}" +
  "b{font-weight:bold}" +
  ".mono{font-family:" +
  MONO_STACK +
  "}" +
  ".verbatim{white-space:pre-wrap}" +
  "a{color:#000080}" +
  "ul,ol{margin:0;padding-left:1.2cm}" +
  "table{border-collapse:separate;border-spacing:0;table-layout:fixed;break-inside:auto}" +
  "tr{break-inside:avoid}" +
  "td{padding:0.05cm 0.1cm;vertical-align:top}" +
  "td.c-head{vertical-align:middle}" +
  strokeCss() +
  ".fill{display:inline-block;width:100%;border-bottom:0.5pt solid #000;height:1em;vertical-align:baseline}" +
  ".tab{display:inline-block;width:1.25cm}" +
  ".rule{margin:6pt 0;border-bottom:0.5pt solid #000;padding-bottom:2pt}" +
  ".page-break{break-before:page}" +
  "table.sheet{width:100%;table-layout:auto}" +
  ".sheet>tbody>tr{break-inside:auto}" +
  ".sheet>*>tr>td{padding:0}";

function pageCss(doc: DocIr): string {
  const page = doc.page;
  const imageCm = page.heightCm - page.marginTopCm - page.marginBottomCm - 1;
  return (
    "@page{size:" +
    cm(page.widthCm) +
    " " +
    cm(page.heightCm) +
    ";margin:0}" +
    "html,body{margin:0;padding:0;background:#fff;color:#000}" +
    "body{padding:0 " +
    cm(page.marginOuterCm) +
    " 0 " +
    cm(page.marginInnerCm) +
    ";font-family:" +
    serifStack(doc.font.family) +
    ";font-size:" +
    String(doc.font.sizePt) +
    "pt;line-height:" +
    String(LINE_RATIO) +
    ";hyphens:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    BLOCK_CSS +
    ".sheet>thead>tr>td{height:" +
    cm(page.marginTopCm) +
    "}" +
    ".sheet>tfoot>tr>td{height:" +
    cm(page.marginBottomCm) +
    "}" +
    ".image{max-width:100%;max-height:" +
    cm(imageCm) +
    ";" +
    "height:auto;object-fit:contain;vertical-align:bottom}"
  );
}

export function printHtml(
  doc: DocIr,
  fontBase = "fonts/",
  images: ImageSet = new Map(),
): string {
  const styles = Object.entries(doc.styles)
    .map(([name, style]) => "." + className(name) + "{" + styleCss(style) + "}")
    .join("");
  const css = fontFaces(fontBase) + pageCss(doc) + styles;
  return (
    '<!doctype html><html lang="mn" translate="no"><head><meta charset="utf-8">' +
    '<meta name="google" content="notranslate">' +
    "<title>" +
    escapeAttr(doc.title ?? "") +
    "</title><style>" +
    css +
    "</style></head><body>" +
    '<table class="sheet"><thead><tr><td></td></tr></thead>' +
    "<tfoot><tr><td></td></tr></tfoot><tbody><tr><td>" +
    doc.blocks.map((block) => blockHtml(block, doc, images)).join("") +
    "</td></tr></tbody></table></body></html>"
  );
}
