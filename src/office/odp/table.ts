import type { DeckTable } from "../deck.ts";
import { SLIDE_STROKE_PT, type TableLayout } from "../decklayout.ts";
import { cellStrokes, type CellStrokes } from "../../markdown/tablelook.ts";
import type { Align } from "../docir.ts";

import { cm, FONT, MARGIN, PAGE, para } from "./text.ts";

export const WIDTH = PAGE.width - 2 * MARGIN;

const ALIGN: Readonly<Record<Align, string>> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

export interface Auto {
  readonly styles: Map<string, string>;
  tables: number;
}

function sizeName(pt: number): string {
  return String(Math.round(pt * 10));
}

export function bodyStyle(auto: Auto, pt: number): string {
  const name = "P_body_" + sizeName(pt);
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="paragraph">' +
      '<style:paragraph-properties fo:margin-bottom="0.2cm"/>' +
      '<style:text-properties fo:font-family="' +
      FONT +
      '" fo:font-size="' +
      (Math.round(pt * 10) / 10).toFixed(1) +
      'pt"/></style:style>',
  );
  return name;
}

function cellParaStyle(auto: Auto, align: Align | null, pt: number): string {
  const name = "P_cell_" + (align ?? "none") + "_" + sizeName(pt);
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="paragraph">' +
      (align
        ? '<style:paragraph-properties fo:text-align="' + ALIGN[align] + '"/>'
        : "") +
      '<style:text-properties fo:font-family="' +
      FONT +
      '" fo:font-size="' +
      (Math.round(pt * 10) / 10).toFixed(1) +
      'pt"/></style:style>',
  );
  return name;
}

const SIDES = ["top", "bottom", "left", "right"] as const;

function cellStyle(auto: Auto, cell: CellStrokes, middle: boolean): string {
  const name =
    "ce_" +
    SIDES.map((side) => String(cell[side])).join("") +
    (middle ? "m" : "");
  const edge = (side: (typeof SIDES)[number]): string =>
    "fo:border-" +
    side +
    '="' +
    (cell[side]
      ? String(SLIDE_STROKE_PT[cell[side]]) + "pt solid #000000"
      : "none") +
    '"';
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="table-cell">' +
      '<style:graphic-properties draw:fill="none" draw:textarea-vertical-align="' +
      (middle ? "middle" : "top") +
      '" fo:padding-top="0.12cm" fo:padding-bottom="0.12cm" ' +
      'fo:padding-left="0.25cm" fo:padding-right="0.25cm"/>' +
      "<style:paragraph-properties " +
      SIDES.map(edge).join(" ") +
      "/>" +
      "</style:style>",
  );
  return name;
}

export function tableXml(
  auto: Auto,
  keys: Set<string>,
  table: DeckTable,
  layout: TableLayout,
  box: { x: number; y: number },
  pt: number,
): string {
  auto.tables += 1;
  const id = String(auto.tables);
  const columns = layout.widths
    .map((width, c) => {
      const name = "co" + id + "_" + String(c);
      auto.styles.set(
        name,
        '<style:style style:name="' +
          name +
          '" style:family="table-column"><style:table-column-properties style:column-width="' +
          cm(width) +
          '"/></style:style>',
      );
      return '<table:table-column table:style-name="' + name + '"/>';
    })
    .join("");
  const rows = table.rows
    .map((row, r) => {
      const head = table.header && r === 0;
      const rowName = "ro" + id + "_" + String(r);
      auto.styles.set(
        rowName,
        '<style:style style:name="' +
          rowName +
          '" style:family="table-row"><style:table-row-properties style:row-height="' +
          cm(layout.heights[r]!) +
          '"/></style:style>',
      );
      const cells = layout.widths
        .map((_, c) => {
          const edges = cellStrokes(table.strokes, {
            row: r,
            rows: table.rows.length,
            column: c,
            columns: layout.widths.length,
          });
          const style = cellStyle(auto, edges, head);
          const runs = (row[c] ?? []).map((run) =>
            head ? { ...run, bold: true } : run,
          );
          return (
            '<table:table-cell table:style-name="' +
            style +
            '">' +
            para(cellParaStyle(auto, table.align[c] ?? null, pt), runs, keys) +
            "</table:table-cell>"
          );
        })
        .join("");
      return (
        '<table:table-row table:style-name="' +
        rowName +
        '">' +
        cells +
        "</table:table-row>"
      );
    })
    .join("");
  const width = layout.widths.reduce((a, b) => a + b, 0);
  const height = layout.heights.reduce((a, b) => a + b, 0);
  return (
    '<draw:frame draw:style-name="gr_table" svg:x="' +
    cm(box.x) +
    '" svg:y="' +
    cm(box.y) +
    '" svg:width="' +
    cm(width) +
    '" svg:height="' +
    cm(height) +
    '"><table:table>' +
    columns +
    rows +
    "</table:table></draw:frame>"
  );
}
