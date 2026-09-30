import type { DeckDoc, DeckLine, DeckPart, DeckTable } from "./deck.ts";
import {
  TABLE_PT,
  TEXT_PT,
  layoutSlide,
  type TableLayout,
} from "./decklayout.ts";
import type { Align, IrRun } from "./docir.ts";
import { printPage } from "./print.ts";

const SLIDE_W = 12192000 / 360000;
const SLIDE_H = 6858000 / 360000;
const MARGIN = 1.7;
const BOX_W = SLIDE_W - 2 * MARGIN;

const PAGE_W = 21;
const PAGE_H = 29.7;
const PAGE_MARGIN = 1.5;
const SLOT_GAP = 1.5;
const FRAME_W = PAGE_W - 2 * PAGE_MARGIN;
const SCALE = FRAME_W / SLIDE_W;
const FRAME_H = SLIDE_H * SCALE;
const PAGE_TOP = (PAGE_H - 2 * PAGE_MARGIN - 2 * FRAME_H - SLOT_GAP) / 2;

const SLIDES_PER_PAGE = 2;

const FONT = 'Arial, "Liberation Sans", Helvetica, sans-serif';
const MONO = '"Courier New", "Liberation Mono", monospace';

const TEXT_ALIGN: Readonly<Record<Align, string>> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "justify",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cm(value: number): string {
  return value.toFixed(3) + "cm";
}

function pt(value: number): string {
  return String(Math.round(value * 100) / 100) + "pt";
}

function runsHtml(runs: readonly IrRun[], bold = false): string {
  let out = "";
  for (const run of runs) {
    if (!run.text) continue;
    let body = esc(run.text).replace(/\n/g, "<br>");
    if (run.mono) body = '<span class="mono">' + body + "</span>";
    if (run.strike) body = "<s>" + body + "</s>";
    if (run.italic) body = "<i>" + body + "</i>";
    if (run.bold || bold) body = "<b>" + body + "</b>";
    if (run.href) body = '<a href="' + esc(run.href) + '">' + body + "</a>";
    out += body;
  }
  return out || "<br>";
}

function box(
  x: number,
  y: number,
  w: number,
  h: number,
  middle: boolean,
  body: string,
): string {
  return (
    '<div class="box' +
    (middle ? " mid" : "") +
    '" style="left:' +
    cm(x) +
    ";top:" +
    cm(y) +
    ";width:" +
    cm(w) +
    ";height:" +
    cm(h) +
    '">' +
    body +
    "</div>"
  );
}

function para(
  runs: readonly IrRun[],
  size: number,
  options: { center?: boolean; bold?: boolean } = {},
): string {
  return (
    '<p style="font-size:' +
    pt(size) +
    (options.center ? ";text-align:center" : "") +
    '">' +
    runsHtml(runs, options.bold) +
    "</p>"
  );
}

function linesHtml(lines: readonly DeckLine[], size: number): string {
  let number = 0;
  return lines
    .map((line) => {
      if (line.kind === "para") {
        number = 0;
        return para(line.runs, size);
      }
      let marker = "•";
      if (line.kind === "number") {
        number = line.start ?? number + 1;
        marker = String(number) + ".";
      } else number = 0;
      return (
        '<p class="li" style="font-size:' +
        pt(size) +
        '"><span class="mk">' +
        marker +
        "</span>" +
        runsHtml(line.runs) +
        "</p>"
      );
    })
    .join("");
}

function tableHtml(
  table: DeckTable,
  layout: TableLayout,
  x: number,
  y: number,
  size: number,
): string {
  const last = table.rows.length - 1;
  const rows = table.rows
    .map((row, r) => {
      const head = table.header && r === 0;
      const classes = [
        r === 0 ? "first" : "",
        r === last ? "last" : head ? "head" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const cells = layout.widths
        .map((width, c) => {
          const align = table.align[c];
          return (
            '<td style="width:' +
            cm(width) +
            (align ? ";text-align:" + TEXT_ALIGN[align] : "") +
            '"' +
            (head ? ' class="h"' : "") +
            ">" +
            runsHtml(row[c] ?? [], head) +
            "</td>"
          );
        })
        .join("");
      return (
        "<tr" +
        (classes ? ' class="' + classes + '"' : "") +
        ' style="height:' +
        cm(layout.heights[r] ?? 0) +
        '">' +
        cells +
        "</tr>"
      );
    })
    .join("");
  return (
    '<table style="left:' +
    cm(x) +
    ";top:" +
    cm(y) +
    ";width:" +
    cm(layout.widths.reduce((sum, width) => sum + width, 0)) +
    ";font-size:" +
    pt(size) +
    '">' +
    rows +
    "</table>"
  );
}

function coverSlide(doc: DeckDoc, title: readonly IrRun[]): string {
  let out = box(
    MARGIN,
    SLIDE_H * 0.25,
    BOX_W,
    SLIDE_H * 0.22,
    true,
    para(title, 36, { center: true, bold: true }),
  );
  if (doc.subtitle.length)
    out += box(
      MARGIN,
      SLIDE_H * 0.5,
      BOX_W,
      SLIDE_H * 0.25,
      false,
      doc.subtitle.map((line) => para(line, 20, { center: true })).join(""),
    );
  return out;
}

function sectionSlide(title: readonly IrRun[]): string {
  return box(
    MARGIN,
    SLIDE_H * 0.35,
    BOX_W,
    SLIDE_H * 0.25,
    true,
    para(title, 36, { center: true, bold: true }),
  );
}

function contentSlide(
  title: readonly IrRun[] | null,
  parts: readonly DeckPart[],
): string {
  let out = "";
  let top = MARGIN;
  if (title !== null) {
    out += box(MARGIN, 0.6, BOX_W, 2.4, true, para(title, 30, { bold: true }));
    top = 3.4;
  }
  const layout = layoutSlide(parts, MARGIN, top, BOX_W, SLIDE_H - top - 1);
  for (const part of layout.parts)
    out +=
      part.kind === "text"
        ? box(
            MARGIN,
            part.y,
            BOX_W,
            part.h,
            false,
            linesHtml(part.lines, TEXT_PT * layout.scale),
          )
        : tableHtml(
            part.table,
            part.layout,
            part.x,
            part.y,
            TABLE_PT * layout.scale,
          );
  return out;
}

function slidesOf(doc: DeckDoc): string[] {
  const out: string[] = [];
  if (doc.title !== null) out.push(coverSlide(doc, doc.title));
  for (const slide of doc.slides)
    out.push(
      slide.section
        ? sectionSlide(slide.title ?? [])
        : contentSlide(slide.title, slide.parts),
    );
  return out;
}

function frame(slide: string): string {
  return '<div class="frame"><div class="slide">' + slide + "</div></div>";
}

export function deckPrintHtml(doc: DeckDoc): string {
  const slides = slidesOf(doc);
  const pages: string[] = [];
  for (let i = 0; i < slides.length; i += SLIDES_PER_PAGE)
    pages.push(
      '<section class="page">' +
        slides
          .slice(i, i + SLIDES_PER_PAGE)
          .map(frame)
          .join("") +
        "</section>",
    );
  const css =
    "@page{size:" +
    cm(PAGE_W) +
    " " +
    cm(PAGE_H) +
    ";margin:" +
    cm(PAGE_MARGIN) +
    "}" +
    "html,body{margin:0;padding:0;background:#fff;color:#000}" +
    "body{font-family:" +
    FONT +
    ";-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".page{display:flex;flex-direction:column;gap:" +
    cm(SLOT_GAP) +
    ";padding-top:" +
    cm(PAGE_TOP) +
    ";break-after:page}" +
    ".page:last-child{break-after:auto}" +
    ".frame{position:relative;width:" +
    cm(FRAME_W) +
    ";height:" +
    cm(FRAME_H) +
    ";overflow:hidden;break-inside:avoid}" +
    '.frame::after{content:"";position:absolute;inset:0;box-sizing:border-box;' +
    "border:0.5pt solid #888;pointer-events:none}" +
    ".slide{position:absolute;left:0;top:0;width:" +
    cm(SLIDE_W) +
    ";height:" +
    cm(SLIDE_H) +
    ";transform:scale(" +
    SCALE.toFixed(5) +
    ");transform-origin:0 0}" +
    ".box{position:absolute;box-sizing:border-box;padding:0.127cm 0.254cm;" +
    "display:flex;flex-direction:column;justify-content:flex-start}" +
    ".box.mid{justify-content:center}" +
    "p{margin:0 0 6pt;line-height:1.2}" +
    ".li{position:relative;padding-left:1.27cm}" +
    ".mk{position:absolute;left:0}" +
    ".mono{font-family:" +
    MONO +
    "}" +
    "a{color:#00f}" +
    "table{position:absolute;border-collapse:collapse;table-layout:fixed}" +
    "td{box-sizing:border-box;padding:0.12cm 0.25cm;vertical-align:top;line-height:1.2}" +
    "td.h{vertical-align:middle}" +
    "tr.first td{border-top:1.5pt solid #000}" +
    "tr.head td{border-bottom:0.75pt solid #000}" +
    "tr.last td{border-bottom:1.5pt solid #000}";
  const title = doc.title?.map((run) => run.text).join("") ?? "";
  return (
    '<!doctype html><html lang="mn"><head><meta charset="utf-8">' +
    "<title>" +
    esc(title.replace(/\s*\n\s*/g, " ")) +
    "</title><style>" +
    css +
    "</style></head><body>" +
    pages.join("") +
    "</body></html>"
  );
}

export function printDeck(doc: DeckDoc): Promise<void> {
  return printPage(deckPrintHtml(doc));
}
