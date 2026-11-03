import { styleId, JC, twips } from "./styles.ts";
import {
  type IrBlock,
  type IrRun,
  STYLE,
  type DocIr,
  textWidthCm,
} from "../docir.ts";
import {
  type Stroke,
  type TableStrokes,
  tableStrokes,
  STROKE_PT,
} from "../../markdown/tablelook.ts";
import { type Body, runsXml } from "./createruns.ts";
import { paraXml } from "./parts.ts";
import { tabFills } from "../flatten.ts";
import { shareWidths, columnWidths, officeMetrics } from "../table.ts";

export function styled(style: string, extra = ""): string {
  return '<w:pStyle w:val="' + styleId(style) + '"/>' + extra;
}

const rule = (side: string, stroke: Stroke): string =>
  stroke === 0
    ? ""
    : "<w:" +
      side +
      ' w:val="single" w:sz="' +
      String(STROKE_PT[stroke] * 8) +
      '" w:space="0" w:color="000000"/>';

function cellXml(
  block: Extract<IrBlock, { kind: "table" }>,
  runs: readonly IrRun[],
  width: number,
  align: (typeof block.align)[number],
  headRule: Stroke | null,
  body: Body,
): string {
  const fill = runs.some((run) => run.fill);
  return (
    '<w:tc><w:tcPr><w:tcW w:w="' +
    String(width) +
    '" w:type="dxa"/>' +
    (headRule
      ? "<w:tcBorders>" + rule("bottom", headRule) + "</w:tcBorders>"
      : "") +
    (headRule === null ? "" : '<w:vAlign w:val="center"/>') +
    "</w:tcPr>" +
    paraXml(
      styled(
        headRule === null
          ? (block.cellStyle ?? STYLE.tableCell)
          : STYLE.tableHead,
        fill
          ? '<w:tabs><w:tab w:val="right" w:leader="underscore" w:pos="' +
              String(Math.max(0, width - 216)) +
              '"/></w:tabs>'
          : align
            ? '<w:jc w:val="' + JC[align] + '"/>'
            : "",
      ),
      runsXml(tabFills(runs), body, false),
    ) +
    "</w:tc>"
  );
}

function tableBorders(strokes: TableStrokes): string {
  const borders =
    rule("top", strokes.top) +
    rule("left", strokes.sides) +
    rule("bottom", strokes.bottom) +
    rule("right", strokes.sides) +
    rule("insideH", strokes.rows) +
    rule("insideV", strokes.columns);
  return borders ? "<w:tblBorders>" + borders + "</w:tblBorders>" : "";
}

function headBorder(
  strokes: TableStrokes,
  head: boolean,
  only: boolean,
): Stroke | null {
  if (!head) return null;
  return only || strokes.head === strokes.rows ? 0 : strokes.head;
}

export function tableXml(
  block: Extract<IrBlock, { kind: "table" }>,
  doc: DocIr,
  body: Body,
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
  ).map(twips);
  const strokes = tableStrokes(block.rules, header);
  const rows = block.rows
    .map((row, rowIndex) => {
      const head = header && rowIndex === 0;
      const under = headBorder(strokes, head, block.rows.length === 1);
      const cells = widths
        .map((width, i) =>
          cellXml(block, row[i] ?? [], width, block.align[i]!, under, body),
        )
        .join("");
      const height =
        block.rowCm && !head
          ? '<w:trHeight w:val="' +
            String(twips(block.rowCm)) +
            '" w:hRule="atLeast"/>'
          : "";
      const props = (head ? "<w:tblHeader/>" : "") + height;
      return (
        "<w:tr>" +
        (props ? "<w:trPr>" + props + "</w:trPr>" : "") +
        cells +
        "</w:tr>"
      );
    })
    .join("");
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="' +
    String(widths.reduce((sum, width) => sum + width, 0)) +
    '" w:type="dxa"/><w:jc w:val="' +
    JC[block.placement ?? "center"] +
    '"/>' +
    tableBorders(strokes) +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="57" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' +
    widths.map((width) => '<w:gridCol w:w="' + String(width) + '"/>').join("") +
    "</w:tblGrid>" +
    rows +
    "</w:tbl>"
  );
}
