import {
  type Stroke,
  STROKE_PT,
  tableStrokes,
  strokeClasses,
  cellStrokes,
} from "../markdown/tablelook.ts";
import {
  type IrBlock,
  type DocIr,
  type ImageSet,
  textWidthCm,
  STYLE,
} from "./docir.ts";
import { shareWidths, columnWidths, officeMetrics } from "./table.ts";
import { TEXT_ALIGN, className, runsHtml } from "./printruns.ts";
import { cm } from "./units.ts";

const TABLE_MARGIN: Readonly<Record<string, string>> = {
  start: "0 auto 0 0",
  center: "0 auto",
  end: "0 0 0 auto",
  justify: "0 auto",
};

export function strokeCss(
  widths: Readonly<Record<Stroke, number>> = STROKE_PT,
): string {
  const sides = { t: "top", b: "bottom", l: "left", r: "right" } as const;
  return Object.entries(sides)
    .flatMap(([key, side]) =>
      ([1, 2] as const).map(
        (stroke) =>
          "td.e-" +
          key +
          String(stroke) +
          "{border-" +
          side +
          ":" +
          String(widths[stroke]) +
          "pt solid #000}",
      ),
    )
    .join("");
}

export function tableHtml(
  block: Extract<IrBlock, { kind: "table" }>,
  doc: DocIr,
  images: ImageSet,
): string {
  const header = block.header !== false;
  const widths = shareWidths(
    columnWidths(
      block.rows,
      header,
      textWidthCm(doc),
      officeMetrics(
        doc.styles[block.cellStyle ?? STYLE.tableCell]?.sizePt ??
          doc.font.sizePt,
      ),
    ),
    block.rule,
    textWidthCm(doc) * (block.share ?? 0),
  );
  const strokes = tableStrokes(block.rules, header);
  const rows = block.rows.map((row, rowIndex) => {
    const head = header && rowIndex === 0;
    const base = head ? STYLE.tableHead : (block.cellStyle ?? STYLE.tableCell);
    const cells = widths
      .map((_, i) => {
        const align = block.align[i];
        const style = align
          ? ' data-style="text-align:' + TEXT_ALIGN[align] + '"'
          : "";
        const place = {
          row: rowIndex,
          rows: block.rows.length,
          column: i,
          columns: widths.length,
        };
        const classes = [
          head ? "c-head" : "",
          strokeClasses(cellStrokes(strokes, place)),
        ]
          .filter(Boolean)
          .join(" ");
        return (
          "<td" +
          (classes ? ' class="' + classes + '"' : "") +
          '><p class="' +
          className(base) +
          '"' +
          style +
          ">" +
          (runsHtml(row[i] ?? [], images) || "<br>") +
          "</p></td>"
        );
      })
      .join("");
    return (
      (block.rowCm && !head
        ? '<tr data-style="height:' + cm(block.rowCm) + '">'
        : "<tr>") +
      cells +
      "</tr>"
    );
  });
  const [first, ...rest] = rows;
  const body = header
    ? "<thead>" + (first ?? "") + "</thead><tbody>" + rest.join("") + "</tbody>"
    : "<tbody>" + rows.join("") + "</tbody>";
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
    body +
    "</table>"
  );
}
