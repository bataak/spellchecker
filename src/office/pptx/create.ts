import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import type { DeckDoc, DeckLine, DeckPart, DeckTable } from "../deck.ts";
import {
  TABLE_PT,
  TEXT_PT,
  layoutSlide,
  type PlacedImage,
  type TableLayout,
} from "../decklayout.ts";
import { imageKey } from "../docir.ts";
import type { Align, ImageFiles, IrRun } from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";
import { REL, XML_HEAD, relsXml, type Rel } from "../ooxml.ts";
import {
  FONT,
  HEIGHT,
  LAYOUT,
  MASTER,
  NS_ALL,
  THEME,
  TREE_HEAD,
  WIDTH,
  contentTypesXml,
  presentationXml,
} from "./parts.ts";

export interface PptxOptions {
  readonly images?: ImageFiles;
}

const encoder = new TextEncoder();

const MONO = "Courier New";

const EMU_CM = 360000;
const MARGIN = Math.round(1.7 * EMU_CM);

interface SlideState {
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

function paraXml(
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

function linesXml(
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

const RULE_HEAVY = 19050;
const RULE_LIGHT = 9525;

function border(tag: string, width: number): string {
  return width
    ? "<a:" +
        tag +
        ' w="' +
        String(width) +
        '"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:' +
        tag +
        ">"
    : "<a:" + tag + ' w="0"><a:noFill/></a:' + tag + ">";
}

function tableXml(
  state: SlideState,
  table: DeckTable,
  layout: TableLayout,
  box: { x: number; y: number },
  size: number,
): string {
  const id = state.shapeId++;
  const widths = layout.widths.map((w) => Math.round(w * EMU_CM));
  const heights = layout.heights.map((h) => Math.round(h * EMU_CM));
  const last = table.rows.length - 1;
  const rows = table.rows
    .map((row, r) => {
      const head = table.header && r === 0;
      const cells = widths
        .map((_, c) => {
          const align = table.align[c];
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
            border("lnL", 0) +
            border("lnR", 0) +
            border("lnT", r === 0 ? RULE_HEAVY : 0) +
            border("lnB", r === last ? RULE_HEAVY : head ? RULE_LIGHT : 0) +
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

function shape(
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

function slideXml(shapes: string): string {
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

interface BuiltSlide {
  readonly xml: string;
  readonly links: readonly Rel[];
}

const BOX_WIDTH = WIDTH - 2 * MARGIN;
const CENTER = '<a:pPr algn="ctr"/>';

function sectionSlide(title: readonly IrRun[]): BuiltSlide {
  const state: SlideState = { links: [], shapeId: 2 };
  const shapes = shape(
    state,
    {
      x: MARGIN,
      y: Math.round(HEIGHT * 0.35),
      w: BOX_WIDTH,
      h: Math.round(HEIGHT * 0.25),
    },
    "ctr",
    paraXml(
      CENTER,
      title.map((run) => ({ ...run, bold: true })),
      3600,
      state,
    ),
  );
  return { xml: slideXml(shapes), links: state.links };
}

function coverSlide(doc: DeckDoc, title: readonly IrRun[]): BuiltSlide {
  const state: SlideState = { links: [], shapeId: 2 };
  let shapes = shape(
    state,
    {
      x: MARGIN,
      y: Math.round(HEIGHT * 0.25),
      w: BOX_WIDTH,
      h: Math.round(HEIGHT * 0.22),
    },
    "ctr",
    paraXml(
      CENTER,
      title.map((run) => ({ ...run, bold: true })),
      3600,
      state,
    ),
  );
  if (doc.subtitle.length)
    shapes += shape(
      state,
      {
        x: MARGIN,
        y: Math.round(HEIGHT * 0.5),
        w: BOX_WIDTH,
        h: Math.round(HEIGHT * 0.25),
      },
      "t",
      doc.subtitle.map((line) => paraXml(CENTER, line, 2000, state)).join(""),
    );
  return { xml: slideXml(shapes), links: state.links };
}

interface Media {
  readonly images: ImageFiles;
  readonly names: Map<string, string>;
}

function pictureXml(
  state: SlideState,
  media: Media,
  embeds: Map<string, string>,
  placed: PlacedImage,
): string {
  const key = imageKey(placed.image);
  const file = media.images.get(key);
  if (!file) return "";
  let name = media.names.get(key);
  if (name === undefined) {
    name = "image" + String(media.names.size + 1) + "." + file.ext;
    media.names.set(key, name);
  }
  let rid = embeds.get(key);
  if (rid === undefined) {
    rid = "rId" + String(state.links.length + 2);
    state.links.push({
      id: rid,
      type: REL + "/image",
      target: "../media/" + name,
    });
    embeds.set(key, rid);
  }
  const id = state.shapeId++;
  return (
    '<p:pic><p:nvPicPr><p:cNvPr id="' +
    String(id) +
    '" name="Picture ' +
    String(id) +
    '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
    '<p:blipFill><a:blip r:embed="' +
    rid +
    '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
    '<p:spPr><a:xfrm><a:off x="' +
    String(Math.round(placed.x * EMU_CM)) +
    '" y="' +
    String(Math.round(placed.y * EMU_CM)) +
    '"/><a:ext cx="' +
    String(Math.round(placed.w * EMU_CM)) +
    '" cy="' +
    String(Math.round(placed.h * EMU_CM)) +
    '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
  );
}

function contentSlide(
  title: readonly IrRun[] | null,
  parts: readonly DeckPart[],
  media: Media,
): BuiltSlide {
  const state: SlideState = { links: [], shapeId: 2 };
  const embeds = new Map<string, string>();
  let shapes = "";
  let top = MARGIN;
  if (title !== null) {
    shapes += shape(
      state,
      {
        x: MARGIN,
        y: Math.round(0.6 * EMU_CM),
        w: BOX_WIDTH,
        h: Math.round(2.4 * EMU_CM),
      },
      "ctr",
      paraXml(
        "",
        title.map((run) => ({ ...run, bold: true })),
        3000,
        state,
      ),
    );
    top = Math.round(3.4 * EMU_CM);
  }
  const layout = layoutSlide(
    parts,
    MARGIN / EMU_CM,
    top / EMU_CM,
    BOX_WIDTH / EMU_CM,
    (HEIGHT - top) / EMU_CM - 1,
    (image) => media.images.get(imageKey(image)),
  );
  for (const part of layout.parts)
    shapes +=
      part.kind === "image"
        ? part.items
            .map((item) => pictureXml(state, media, embeds, item))
            .join("")
        : part.kind === "text"
          ? shape(
              state,
              {
                x: MARGIN,
                y: Math.round(part.y * EMU_CM),
                w: BOX_WIDTH,
                h: Math.round(part.h * EMU_CM),
              },
              "t",
              linesXml(
                part.lines,
                state,
                Math.round(TEXT_PT * layout.scale * 100),
              ),
            )
          : tableXml(
              state,
              part.table,
              part.layout,
              part,
              Math.round(TABLE_PT * layout.scale * 100),
            );
  return { xml: slideXml(shapes), links: state.links };
}

export function buildPptx(
  doc: DeckDoc,
  options: PptxOptions = {},
): Uint8Array<ArrayBuffer> {
  const media: Media = {
    images: options.images ?? new Map(),
    names: new Map(),
  };
  const built: BuiltSlide[] = [];
  if (doc.title !== null) built.push(coverSlide(doc, doc.title));
  for (const slide of doc.slides)
    built.push(
      slide.section
        ? sectionSlide(slide.title ?? [])
        : contentSlide(slide.title, slide.parts, media),
    );

  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(built.length, [
      ...new Set([...media.names.values()].map((name) => name.split(".")[1]!)),
    ]),
    "_rels/.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/officeDocument",
        target: "ppt/presentation.xml",
      },
    ]),
    "ppt/presentation.xml": presentationXml(built.length),
    "ppt/_rels/presentation.xml.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/slideMaster",
        target: "slideMasters/slideMaster1.xml",
      },
      { id: "rId2", type: REL + "/theme", target: "theme/theme1.xml" },
      ...built.map((_, i) => ({
        id: "rId" + String(i + 3),
        type: REL + "/slide",
        target: "slides/slide" + String(i + 1) + ".xml",
      })),
    ]),
    "ppt/slideMasters/slideMaster1.xml": MASTER,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/slideLayout",
        target: "../slideLayouts/slideLayout1.xml",
      },
      { id: "rId2", type: REL + "/theme", target: "../theme/theme1.xml" },
    ]),
    "ppt/slideLayouts/slideLayout1.xml": LAYOUT,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/slideMaster",
        target: "../slideMasters/slideMaster1.xml",
      },
    ]),
    "ppt/theme/theme1.xml": THEME,
  };

  built.forEach((slide, i) => {
    const name = "slide" + String(i + 1) + ".xml";
    files["ppt/slides/" + name] = slide.xml;
    files["ppt/slides/_rels/" + name + ".rels"] = relsXml([
      {
        id: "rId1",
        type: REL + "/slideLayout",
        target: "../slideLayouts/slideLayout1.xml",
      },
      ...slide.links,
    ]);
  });

  const zippable: Zippable = {};
  for (const [name, xml] of Object.entries(files))
    zippable[name] = encoder.encode(xml);
  for (const [key, name] of media.names)
    zippable["ppt/media/" + name] = media.images.get(key)!.bytes;
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
