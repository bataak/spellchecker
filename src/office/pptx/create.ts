import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import type { DeckDoc, DeckLine } from "../deck.ts";
import type { IrRun } from "../docir.ts";

const encoder = new TextEncoder();

const FONT = "Arial";
const MONO = "Courier New";

const WIDTH = 12192000;
const HEIGHT = 6858000;
const EMU_CM = 360000;
const MARGIN = Math.round(1.7 * EMU_CM);

const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NS_ALL = NS_A + " " + NS_R + " " + NS_P;

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument.presentationml.";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Rel {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

function relsXml(rels: readonly Rel[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="' +
    REL_PKG +
    '">' +
    rels
      .map(
        (rel) =>
          '<Relationship Id="' +
          rel.id +
          '" Type="' +
          rel.type +
          '" Target="' +
          esc(rel.target) +
          '"' +
          (rel.external ? ' TargetMode="External"' : "") +
          "/>",
      )
      .join("") +
    "</Relationships>"
  );
}

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
    state.links.push({ id, type: REL + "/hyperlink", target: run.href, external: true });
    inner += '<a:hlinkClick r:id="' + id + '"/>';
  }
  return "<a:r><a:rPr" + attrs + ">" + inner + "</a:rPr><a:t>" + esc(run.text) + "</a:t></a:r>";
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
    return "<a:pPr" + indent + ">" + SPACE_AFTER + BULLET_FONT + '<a:buChar char="•"/></a:pPr>';
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

function linesXml(lines: readonly DeckLine[], state: SlideState): string {
  let start = 1;
  return lines
    .map((line) => {
      if (line.kind === "number" && line.start !== undefined) start = line.start;
      return paraXml(linePPr(line, start), line.runs, 2000, state);
    })
    .join("");
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

const TREE_HEAD =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

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

function coverSlide(doc: DeckDoc, title: readonly IrRun[]): BuiltSlide {
  const state: SlideState = { links: [], shapeId: 2 };
  let shapes = shape(
    state,
    { x: MARGIN, y: Math.round(HEIGHT * 0.25), w: BOX_WIDTH, h: Math.round(HEIGHT * 0.22) },
    "ctr",
    paraXml(CENTER, title.map((run) => ({ ...run, bold: true })), 3600, state),
  );
  if (doc.subtitle.length)
    shapes += shape(
      state,
      { x: MARGIN, y: Math.round(HEIGHT * 0.5), w: BOX_WIDTH, h: Math.round(HEIGHT * 0.25) },
      "t",
      doc.subtitle.map((line) => paraXml(CENTER, line, 2000, state)).join(""),
    );
  return { xml: slideXml(shapes), links: state.links };
}

function contentSlide(
  title: readonly IrRun[] | null,
  lines: readonly DeckLine[],
): BuiltSlide {
  const state: SlideState = { links: [], shapeId: 2 };
  let shapes = "";
  let top = MARGIN;
  if (title !== null) {
    shapes += shape(
      state,
      { x: MARGIN, y: Math.round(0.6 * EMU_CM), w: BOX_WIDTH, h: Math.round(2.4 * EMU_CM) },
      "ctr",
      paraXml("", title.map((run) => ({ ...run, bold: true })), 3000, state),
    );
    top = Math.round(3.4 * EMU_CM);
  }
  if (lines.length)
    shapes += shape(
      state,
      { x: MARGIN, y: top, w: BOX_WIDTH, h: HEIGHT - top - Math.round(1 * EMU_CM) },
      "t",
      linesXml(lines, state),
    );
  return { xml: slideXml(shapes), links: state.links };
}

const THEME =
  XML_HEAD +
  "<a:theme " +
  NS_A +
  ' name="Office"><a:themeElements>' +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F497D"/></a:dk2>' +
  '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>' +
  '<a:accent2><a:srgbClr val="C0504D"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>' +
  '<a:accent4><a:srgbClr val="8064A2"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>' +
  '<a:accent6><a:srgbClr val="F79646"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0000FF"/></a:hlink>' +
  '<a:folHlink><a:srgbClr val="800080"/></a:folHlink>' +
  "</a:clrScheme>" +
  '<a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="' + FONT + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="' + FONT + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  "</a:fontScheme>" +
  '<a:fmtScheme name="Office">' +
  "<a:fillStyleLst>" +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  "</a:fillStyleLst><a:lnStyleLst>" +
  '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3) +
  "</a:lnStyleLst><a:effectStyleLst>" +
  "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) +
  "</a:effectStyleLst><a:bgFillStyleLst>" +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  "</a:bgFillStyleLst></a:fmtScheme>" +
  "</a:themeElements></a:theme>";

const MASTER =
  XML_HEAD +
  "<p:sldMaster " +
  NS_ALL +
  "><p:cSld>" +
  '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
  "<p:spTree>" +
  TREE_HEAD +
  "</p:spTree></p:cSld>" +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
  'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
  'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  "<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>" +
  "</p:sldMaster>";

const LAYOUT =
  XML_HEAD +
  "<p:sldLayout " +
  NS_ALL +
  ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' +
  TREE_HEAD +
  "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

function presentationXml(count: number): string {
  let ids = "";
  for (let i = 0; i < count; i++)
    ids += '<p:sldId id="' + String(256 + i) + '" r:id="rId' + String(i + 3) + '"/>';
  return (
    XML_HEAD +
    "<p:presentation " +
    NS_ALL +
    ' saveSubsetFonts="1">' +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (count ? "<p:sldIdLst>" + ids + "</p:sldIdLst>" : "") +
    '<p:sldSz cx="' +
    String(WIDTH) +
    '" cy="' +
    String(HEIGHT) +
    '"/><p:notesSz cx="6858000" cy="9144000"/>' +
    "</p:presentation>"
  );
}

function contentTypesXml(count: number): string {
  let slides = "";
  for (let i = 1; i <= count; i++)
    slides +=
      '<Override PartName="/ppt/slides/slide' +
      String(i) +
      '.xml" ContentType="' +
      CT +
      'slide+xml"/>';
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="' +
    CT +
    'presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' +
    CT +
    'slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' +
    CT +
    'slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    slides +
    "</Types>"
  );
}

export function buildPptx(doc: DeckDoc): Uint8Array<ArrayBuffer> {
  const built: BuiltSlide[] = [];
  if (doc.title !== null) built.push(coverSlide(doc, doc.title));
  for (const slide of doc.slides) built.push(contentSlide(slide.title, slide.lines));

  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(built.length),
    "_rels/.rels": relsXml([
      { id: "rId1", type: REL + "/officeDocument", target: "ppt/presentation.xml" },
    ]),
    "ppt/presentation.xml": presentationXml(built.length),
    "ppt/_rels/presentation.xml.rels": relsXml([
      { id: "rId1", type: REL + "/slideMaster", target: "slideMasters/slideMaster1.xml" },
      { id: "rId2", type: REL + "/theme", target: "theme/theme1.xml" },
      ...built.map((_, i) => ({
        id: "rId" + String(i + 3),
        type: REL + "/slide",
        target: "slides/slide" + String(i + 1) + ".xml",
      })),
    ]),
    "ppt/slideMasters/slideMaster1.xml": MASTER,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": relsXml([
      { id: "rId1", type: REL + "/slideLayout", target: "../slideLayouts/slideLayout1.xml" },
      { id: "rId2", type: REL + "/theme", target: "../theme/theme1.xml" },
    ]),
    "ppt/slideLayouts/slideLayout1.xml": LAYOUT,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": relsXml([
      { id: "rId1", type: REL + "/slideMaster", target: "../slideMasters/slideMaster1.xml" },
    ]),
    "ppt/theme/theme1.xml": THEME,
  };

  built.forEach((slide, i) => {
    const name = "slide" + String(i + 1) + ".xml";
    files["ppt/slides/" + name] = slide.xml;
    files["ppt/slides/_rels/" + name + ".rels"] = relsXml([
      { id: "rId1", type: REL + "/slideLayout", target: "../slideLayouts/slideLayout1.xml" },
      ...slide.links,
    ]);
  });

  const zippable: Zippable = {};
  for (const [name, xml] of Object.entries(files)) zippable[name] = encoder.encode(xml);
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
