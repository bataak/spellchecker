import {
  type CellStrokes,
  STROKE_PT,
  tableStrokes,
  cellStrokes,
} from "../../markdown/tablelook.ts";
import { cm } from "../units.ts";
import { type IrBlock, type DocIr, textWidthCm, STYLE } from "../docir.ts";
import { type Media, runsXml } from "./createruns.ts";
import { shareWidths, columnWidths, officeMetrics } from "../table.ts";
import { tabFills } from "../flatten.ts";

const ODT_ALIGN: Readonly<Record<string, string>> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

const TABLE_ALIGN: Readonly<Record<string, string>> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "center",
};

const SIDES = ["top", "bottom", "left", "right"] as const;

function cellStyle(
  cell: CellStrokes,
  head: boolean,
  auto: Set<string>,
): string {
  const name =
    "C_" + SIDES.map((side) => String(cell[side])).join("") + (head ? "h" : "");
  const borders = SIDES.filter((side) => cell[side] > 0)
    .map(
      (side) =>
        "fo:border-" +
        side +
        '="' +
        String(STROKE_PT[cell[side]]) +
        'pt solid #000000" ',
    )
    .join("");
  auto.add(
    '<style:style style:name="' +
      name +
      '" style:family="table-cell"><style:table-cell-properties ' +
      borders +
      'fo:padding-top="0.05cm" fo:padding-bottom="0.05cm" ' +
      'fo:padding-left="0.1cm" fo:padding-right="0.1cm" ' +
      'style:vertical-align="' +
      (head ? "middle" : "top") +
      '"/></style:style>',
  );
  return name;
}

function tableStyles(
  name: string,
  widths: readonly number[],
  placement: string,
): string {
  return (
    '<style:style style:name="' +
    name +
    '" style:family="table"><style:table-properties style:width="' +
    cm(widths.reduce((sum, width) => sum + width, 0)) +
    '" table:align="' +
    TABLE_ALIGN[placement] +
    '"/></style:style>' +
    widths
      .map(
        (width, i) =>
          '<style:style style:name="' +
          name +
          ".C" +
          String(i + 1) +
          '" style:family="table-column"><style:table-column-properties style:column-width="' +
          cm(width) +
          '"/></style:style>',
      )
      .join("")
  );
}

function fillStyle(base: string, tab: number, auto: Set<string>): string {
  const para = base + "_fill_" + String(Math.round(tab * 100));
  auto.add(
    '<style:style style:name="' +
      para +
      '" style:family="paragraph" style:parent-style-name="' +
      base +
      '"><style:paragraph-properties><style:tab-stops>' +
      '<style:tab-stop style:position="' +
      cm(tab) +
      '" style:type="right" style:leader-style="solid" ' +
      'style:leader-type="single" style:leader-width="0.5pt"/>' +
      "</style:tab-stops></style:paragraph-properties></style:style>",
  );
  return para;
}

function alignStyle(
  base: string,
  align: string | null | undefined,
  auto: Set<string>,
): string {
  if (!align) return base;
  const para = base + "_" + ODT_ALIGN[align];
  auto.add(
    '<style:style style:name="' +
      para +
      '" style:family="paragraph" style:parent-style-name="' +
      base +
      '"><style:paragraph-properties fo:text-align="' +
      ODT_ALIGN[align] +
      '"/></style:style>',
  );
  return para;
}

function cellXml(cellStyle: string, para: string, body: string): string {
  return (
    '<table:table-cell table:style-name="' +
    cellStyle +
    '" office:value-type="string"><text:p text:style-name="' +
    para +
    '">' +
    body +
    "</text:p></table:table-cell>"
  );
}

export function tableXml(
  block: Extract<IrBlock, { kind: "table" }>,
  index: number,
  doc: DocIr,
  auto: Set<string>,
  media: Media,
): string {
  const header = block.header !== false;
  const name = "Table" + String(index + 1);
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
  auto.add(tableStyles(name, widths, block.placement ?? "center"));
  if (block.rowCm)
    auto.add(
      '<style:style style:name="' +
        name +
        '.R" style:family="table-row"><style:table-row-properties style:min-row-height="' +
        cm(block.rowCm) +
        '"/></style:style>',
    );
  const rows = block.rows
    .map((row, rowIndex) => {
      const head = header && rowIndex === 0;
      const base = head ? "TableHead" : (block.cellStyle ?? "TableCell");
      const cells = widths
        .map((width, i) => {
          const runs = row[i] ?? [];
          const place = {
            row: rowIndex,
            rows: block.rows.length,
            column: i,
            columns: widths.length,
          };
          const style = cellStyle(cellStrokes(strokes, place), head, auto);
          if (runs.some((run) => run.fill)) {
            const para = fillStyle(base, Math.max(0, width - 0.2), auto);
            return cellXml(style, para, runsXml(tabFills(runs), media));
          }
          const para = alignStyle(base, block.align[i], auto);
          return cellXml(style, para, runsXml(runs, media));
        })
        .join("");
      return (
        (block.rowCm && !head
          ? '<table:table-row table:style-name="' + name + '.R">'
          : "<table:table-row>") +
        cells +
        "</table:table-row>"
      );
    })
    .join("");
  return (
    '<table:table table:name="' +
    name +
    '" table:style-name="' +
    name +
    '">' +
    widths
      .map(
        (_, i) =>
          '<table:table-column table:style-name="' +
          name +
          ".C" +
          String(i + 1) +
          '"/>',
      )
      .join("") +
    rows +
    "</table:table>"
  );
}
