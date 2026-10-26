import { STYLE, imageKey } from "./docir.ts";
import type {
  DocIr,
  ImageSet,
  IrBlock,
  IrImage,
  IrRun,
  ParaStyle,
  PreparedImage,
} from "./docir.ts";
import { listTree, type ListTree } from "../markdown.ts";
import { odfFont } from "./fonts.ts";
import { columnWidths, officeMetrics } from "./table.ts";
import { escapeAttr } from "../core/htmlutil.ts";
import { cm } from "./units.ts";

const LINE_RATIO = 1.15;

const TEXT_ALIGN: Readonly<Record<string, string>> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "justify",
};

const TABLE_MARGIN: Readonly<Record<string, string>> = {
  start: "0 auto 0 0",
  center: "0 auto",
  end: "0 0 0 auto",
  justify: "0 auto",
};

function family(name: string): string {
  return '"' + name + '"';
}

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

function className(name: string): string {
  return "s-" + name.replace(/[^A-Za-z0-9_-]/g, "_");
}

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

function imageHtml(image: IrImage, prepared: PreparedImage): string {
  const width =
    image.widthPercent !== undefined
      ? "width:" + String(image.widthPercent) + "%"
      : prepared.widthPx > 0
        ? "width:" + String(prepared.widthPx) + "px"
        : "";
  return (
    '<img class="image" src="' +
    escapeAttr(prepared.url) +
    '" alt=""' +
    (width ? ' data-style="' + width + '"' : "") +
    ">"
  );
}

function runsHtml(runs: readonly IrRun[], images: ImageSet): string {
  let out = "";
  for (const run of runs) {
    if (run.image) {
      const prepared = images.get(imageKey(run.image));
      if (prepared) out += imageHtml(run.image, prepared);
      continue;
    }
    if (run.tab) {
      out += '<span class="tab"></span>';
      continue;
    }
    if (run.fill) {
      out += '<span class="fill"></span>';
      continue;
    }
    if (!run.text) continue;
    let body = escapeAttr(run.text).replace(/\n/g, "<br>");
    if (run.mono) body = '<span class="mono">' + body + "</span>";
    if (run.strike) body = "<s>" + body + "</s>";
    if (run.italic) body = "<i>" + body + "</i>";
    if (run.bold) body = "<b>" + body + "</b>";
    if (run.href)
      body = '<a href="' + escapeAttr(run.href) + '">' + body + "</a>";
    out += body;
  }
  return out;
}

function para(style: string, runs: readonly IrRun[], images: ImageSet): string {
  return (
    '<p class="' +
    className(style) +
    '">' +
    (runsHtml(runs, images) || "<br>") +
    "</p>"
  );
}

function cellClass(header: boolean, row: number, last: number): string {
  if (!header) return "c-plain";
  if (row === 0) return row === last ? "c-only" : "c-head";
  return row === last ? "c-last" : "c-plain";
}

function blockHtml(block: IrBlock, doc: DocIr, images: ImageSet): string {
  switch (block.kind) {
    case "para":
      return para(block.style, block.runs, images);

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

    case "table": {
      const header = block.header !== false;
      const widths = columnWidths(
        block.rows,
        header,
        doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm,
        officeMetrics(
          doc.styles[block.cellStyle ?? STYLE.tableCell]?.sizePt ??
            doc.font.sizePt,
        ),
      );
      const last = block.rows.length - 1;
      const rows = block.rows
        .map((row, rowIndex) => {
          const head = header && rowIndex === 0;
          const base = head
            ? STYLE.tableHead
            : (block.cellStyle ?? STYLE.tableCell);
          const cells = widths
            .map((_, i) => {
              const align = block.align[i];
              const style = align
                ? ' data-style="text-align:' + TEXT_ALIGN[align] + '"'
                : "";
              return (
                '<td class="' +
                cellClass(header, rowIndex, last) +
                '"><p class="' +
                className(base) +
                '"' +
                style +
                ">" +
                (runsHtml(row[i] ?? [], images) || "<br>") +
                "</p></td>"
              );
            })
            .join("");
          return "<tr>" + cells + "</tr>";
        })
        .join("");
      return (
        '<table data-style="width:' +
        cm(widths.reduce((sum, width) => sum + width, 0)) +
        ";margin:" +
        TABLE_MARGIN[block.placement ?? "center"] +
        '"><colgroup>' +
        widths
          .map((width) => '<col data-style="width:' + cm(width) + '">')
          .join("") +
        "</colgroup>" +
        rows +
        "</table>"
      );
    }

    case "rule":
      return '<p class="rule"></p>';

    case "break":
      return '<p class="page-break"></p>';
  }
}

export function fontFaces(fontBase: string): string {
  const url = (file: string): string => fontBase + file;
  const face = (name: string, file: string, weight: number, style: string) =>
    "@font-face{font-family:" +
    family(name) +
    ';src:url("' +
    url(file) +
    '") format("woff2");font-weight:' +
    String(weight) +
    ";font-style:" +
    style +
    "}";
  return (
    face("Bichig Serif", "pt-serif-mn-400-v1.woff2", 400, "normal") +
    face("Bichig Serif", "pt-serif-mn-700-v1.woff2", 700, "normal") +
    face("Bichig Serif", "pt-serif-mn-italic-v2.woff2", 400, "italic") +
    face("Bichig Mono", "dejavu-mono-mn-400-v1.woff2", 400, "normal") +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-700i-v1.woff2",
      700,
      "italic",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-700i-v1.woff2",
      700,
      "italic",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-700i-v1.woff2",
      700,
      "italic",
    )
  );
}

export function printFontBase(): string {
  return new URL(import.meta.env.BASE_URL + "fonts/", location.href).href;
}

export function printHtml(
  doc: DocIr,
  fontBase = "fonts/",
  images: ImageSet = new Map(),
): string {
  const page = doc.page;
  const base = doc.font.family;
  const styles = Object.entries(doc.styles)
    .map(([name, style]) => "." + className(name) + "{" + styleCss(style) + "}")
    .join("");
  const css =
    fontFaces(fontBase) +
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
    serifStack(base) +
    ";font-size:" +
    String(doc.font.sizePt) +
    "pt;line-height:" +
    String(LINE_RATIO) +
    ";hyphens:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "p{margin:0;orphans:2;widows:2}" +
    "b{font-weight:bold}" +
    ".mono{font-family:" +
    MONO_STACK +
    "}" +
    "a{color:#000080}" +
    "ul,ol{margin:0;padding-left:1.2cm}" +
    "table{border-collapse:collapse;table-layout:fixed;break-inside:auto}" +
    "tr{break-inside:avoid}" +
    "td{padding:0.05cm 0.1cm;vertical-align:top}" +
    "td.c-head{border-top:1pt solid #000;border-bottom:0.5pt solid #000;vertical-align:middle}" +
    "td.c-only{border-top:1pt solid #000;border-bottom:1pt solid #000;vertical-align:middle}" +
    "td.c-last{border-bottom:1pt solid #000}" +
    ".fill{display:inline-block;width:100%;border-bottom:0.5pt solid #000;height:1em;vertical-align:baseline}" +
    ".tab{display:inline-block;width:1.25cm}" +
    ".rule{margin:6pt 0;border-bottom:0.5pt solid #000;padding-bottom:2pt}" +
    ".page-break{break-before:page}" +
    "table.sheet{width:100%;table-layout:auto}" +
    ".sheet>tbody>tr{break-inside:auto}" +
    ".sheet>*>tr>td{padding:0}" +
    ".sheet>thead>tr>td{height:" +
    cm(page.marginTopCm) +
    "}" +
    ".sheet>tfoot>tr>td{height:" +
    cm(page.marginBottomCm) +
    "}" +
    ".image{max-width:100%;max-height:" +
    cm(page.heightCm - page.marginTopCm - page.marginBottomCm - 1) +
    ";height:auto;object-fit:contain;vertical-align:bottom}" +
    styles;
  return (
    '<!doctype html><html lang="mn"><head><meta charset="utf-8">' +
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
