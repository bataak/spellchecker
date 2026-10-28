import type { DeckLine, DeckTable } from "../deck.ts";
import { SLIDE_STROKE_PT, TEXT_PT, type TableLayout } from "../decklayout.ts";
import { cellStrokes, type Stroke } from "../../markdown/tablelook.ts";
import type { Align, IrRun } from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";
import { REL, XML_HEAD, type Rel } from "../ooxml.ts";
import { FONT, NS_ALL, TREE_HEAD } from "./parts.ts";

const MONO = "Courier New";

export const EMU_CM = 360000;

export interface SlideState {
  readonly links: Rel[];
  shapeId: number;
}

function runXml(run: IrRun, size: number, state: SlideState): string {
  if (!run.text) return "";
  let attrs = ' lang="mn-MN" sz="' + String(size) + '"';
  if (run.bold) attrs += ' b="1"';
  if (run.italic) attrs += ' i="1"';
  if (run.strike) attrs += ' strike="sngStrike"';
  let inner = '<a:latin typeface="' + (run.mono ? MONO : FONT) + '"/>';
  if (run.href) {
    const id = "rId" + String(state.links.length + 2);
    state.links.push({
      id,
      type: REL + "/hyperlink",
      target: run.href,
      external: true,
    });
    inner += '<a:hlinkClick r:id="' + id + '"/>';
  }
  const rPr = "<a:rPr" + attrs + ">" + inner + "</a:rPr>";
  return run.text
    .split("\n")
    .map((part) => "<a:r>" + rPr + "<a:t>" + xmlAttr(part) + "</a:t></a:r>")
    .join("<a:br>" + rPr + "</a:br>");
}

export function paraXml(
  pPr: string,
  runs: readonly IrRun[],
  size: number,
  state: SlideState,
): string {
  return (
    "<a:p>" +
    pPr +
    runs.map((run) => runXml(run, size, state)).join("") +
    '<a:endParaRPr lang="mn-MN" sz="' +
    String(size) +
    '"/></a:p>'
  );
}

const SPACE_AFTER = '<a:spcAft><a:spcPts val="600"/></a:spcAft>';
const BULLET_FONT = '<a:buFont typeface="' + FONT + '"/>';

function linePPr(line: DeckLine, start: number): string {
  if (line.kind === "para")
    return '<a:pPr marL="0" indent="0">' + SPACE_AFTER + "<a:buNone/></a:pPr>";
  const indent = ' marL="457200" indent="-457200"';
  if (line.kind === "bullet")
    return (
      "<a:pPr" +
      indent +
      ">" +
      SPACE_AFTER +
      BULLET_FONT +
      '<a:buChar char="•"/></a:pPr>'
    );
  return (
    "<a:pPr" +
    indent +
    ">" +
    SPACE_AFTER +
    BULLET_FONT +
    '<a:buAutoNum type="arabicPeriod"' +
    (start === 1 ? "" : ' startAt="' + String(start) + '"') +
    "/></a:pPr>"
  );
}

export function linesXml(
  lines: readonly DeckLine[],
  state: SlideState,
  size = TEXT_PT * 100,
): string {
  let start = 1;
  return lines
    .map((line) => {
      if (line.kind === "number" && line.start !== undefined)
        start = line.start;
      return paraXml(linePPr(line, start), line.runs, size, state);
    })
    .join("");
}

const ALGN: Readonly<Record<Align, string>> = {
  start: "l",
  center: "ctr",
  end: "r",
  justify: "just",
};

const EMU_PT = 12700;

function border(tag: string, stroke: Stroke): string {
  return stroke
    ? "<a:" +
        tag +
        ' w="' +
        String(SLIDE_STROKE_PT[stroke] * EMU_PT) +
        '"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:' +
        tag +
        ">"
    : "<a:" + tag + ' w="0"><a:noFill/></a:' + tag + ">";
}

export function tableXml(
  state: SlideState,
  table: DeckTable,
  layout: TableLayout,
  box: { x: number; y: number },
  size: number,
): string {
  const id = state.shapeId++;
  const widths = layout.widths.map((w) => Math.round(w * EMU_CM));
  const heights = layout.heights.map((h) => Math.round(h * EMU_CM));
  const rows = table.rows
    .map((row, r) => {
      const head = table.header && r === 0;
      const cells = widths
        .map((_, c) => {
          const align = table.align[c];
          const edges = cellStrokes(table.strokes, {
            row: r,
            rows: table.rows.length,
            column: c,
            columns: widths.length,
          });
          const pPr = align ? '<a:pPr algn="' + ALGN[align] + '"/>' : "";
          const runs = (row[c] ?? []).map((run) =>
            head ? { ...run, bold: true } : run,
          );
          return (
            "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>" +
            paraXml(pPr, runs, size, state) +
            '</a:txBody><a:tcPr marL="90000" marR="90000" marT="43200" marB="43200" anchor="' +
            (head ? "ctr" : "t") +
            '">' +
            border("lnL", edges.left) +
            border("lnR", edges.right) +
            border("lnT", edges.top) +
            border("lnB", edges.bottom) +
            "<a:noFill/></a:tcPr></a:tc>"
          );
        })
        .join("");
      return '<a:tr h="' + String(heights[r]) + '">' + cells + "</a:tr>";
    })
    .join("");
  return (
    "<p:graphicFrame><p:nvGraphicFramePr>" +
    '<p:cNvPr id="' +
    String(id) +
    '" name="Table ' +
    String(id) +
    '"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
    '<p:xfrm><a:off x="' +
    String(Math.round(box.x * EMU_CM)) +
    '" y="' +
    String(Math.round(box.y * EMU_CM)) +
    '"/><a:ext cx="' +
    String(widths.reduce((a, b) => a + b, 0)) +
    '" cy="' +
    String(heights.reduce((a, b) => a + b, 0)) +
    '"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    '<a:tbl><a:tblPr firstRow="' +
    (table.header ? "1" : "0") +
    '"/><a:tblGrid>' +
    widths.map((w) => '<a:gridCol w="' + String(w) + '"/>').join("") +
    "</a:tblGrid>" +
    rows +
    "</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"
  );
}

export function shape(
  state: SlideState,
  box: { x: number; y: number; w: number; h: number },
  anchor: "t" | "ctr",
  body: string,
): string {
  const id = state.shapeId++;
  return (
    "<p:sp><p:nvSpPr>" +
    '<p:cNvPr id="' +
    String(id) +
    '" name="TextBox ' +
    String(id) +
    '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="' +
    String(box.x) +
    '" y="' +
    String(box.y) +
    '"/><a:ext cx="' +
    String(box.w) +
    '" cy="' +
    String(box.h) +
    '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
    '<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="' +
    anchor +
    '"><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
    body +
    "</p:txBody></p:sp>"
  );
}

export function slideXml(shapes: string): string {
  return (
    XML_HEAD +
    "<p:sld " +
    NS_ALL +
    "><p:cSld><p:spTree>" +
    TREE_HEAD +
    shapes +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
  );
}
