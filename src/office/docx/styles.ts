import type { Align, DocIr, ParaStyle } from "../docir.ts";
import { XML_HEAD } from "../ooxml.ts";
import { xmlAttr } from "../sanitize.ts";

export const MONO = "Courier New";
const TWIP_CM = 567;

export const NS_W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function twips(cm: number): number {
  return Math.round(cm * TWIP_CM);
}

export const JC: Record<Align, string> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "both",
};

export function styleId(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

function pPrInner(style: ParaStyle): string {
  let out = "";
  if (style.keepWithNext) out += "<w:keepNext/>";
  if (style.breakBefore) out += "<w:pageBreakBefore/>";
  if (style.borderBottom)
    out +=
      '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>';
  const spacing: string[] = [];
  if (style.spaceBeforePt !== undefined)
    spacing.push(
      'w:before="' + String(Math.round(style.spaceBeforePt * 20)) + '"',
    );
  if (style.spaceAfterPt !== undefined)
    spacing.push(
      'w:after="' + String(Math.round(style.spaceAfterPt * 20)) + '"',
    );
  if (style.lineHeightPercent !== undefined)
    spacing.push(
      'w:line="' +
        String(Math.round((style.lineHeightPercent * 240) / 100)) +
        '" w:lineRule="auto"',
    );
  if (spacing.length) out += "<w:spacing " + spacing.join(" ") + "/>";
  const ind: string[] = [];
  if (style.marginLeftCm !== undefined)
    ind.push('w:left="' + String(twips(style.marginLeftCm)) + '"');
  if (style.marginRightCm !== undefined)
    ind.push('w:right="' + String(twips(style.marginRightCm)) + '"');
  if (style.firstLineIndentCm !== undefined)
    ind.push('w:firstLine="' + String(twips(style.firstLineIndentCm)) + '"');
  if (ind.length) out += "<w:ind " + ind.join(" ") + "/>";
  if (style.align) out += '<w:jc w:val="' + JC[style.align] + '"/>';
  if (style.outlineLevel !== undefined)
    out += '<w:outlineLvl w:val="' + String(style.outlineLevel - 1) + '"/>';
  return out;
}

function rPrInner(style: ParaStyle): string {
  let out = "";
  if (style.mono)
    out +=
      '<w:rFonts w:ascii="' +
      MONO +
      '" w:hAnsi="' +
      MONO +
      '" w:cs="' +
      MONO +
      '"/>';
  if (style.bold) out += "<w:b/><w:bCs/>";
  if (style.italic) out += "<w:i/><w:iCs/>";
  if (style.sizePt !== undefined) {
    const half = String(Math.round(style.sizePt * 2));
    out += '<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>';
  }
  return out;
}

function styleXml(name: string, style: ParaStyle): string {
  const heading = /^Heading([1-6])$/.exec(name);
  const pPr = pPrInner(style);
  const rPr = rPrInner(style);
  return (
    '<w:style w:type="paragraph" w:customStyle="' +
    (heading ? "0" : "1") +
    '" w:styleId="' +
    styleId(name) +
    '"><w:name w:val="' +
    (heading ? "heading " + heading[1] : xmlAttr(name)) +
    '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    (heading ? '<w:uiPriority w:val="9"/>' : "") +
    "<w:qFormat/>" +
    (pPr ? "<w:pPr>" + pPr + "</w:pPr>" : "") +
    (rPr ? "<w:rPr>" + rPr + "</w:rPr>" : "") +
    "</w:style>"
  );
}

export function stylesXml(doc: DocIr): string {
  const font = xmlAttr(doc.font.family);
  const half = String(Math.round(doc.font.sizePt * 2));
  return (
    XML_HEAD +
    "<w:styles " +
    NS_W +
    ">" +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="' +
    font +
    '" w:hAnsi="' +
    font +
    '" w:eastAsia="' +
    font +
    '" w:cs="' +
    font +
    '"/>' +
    '<w:sz w:val="' +
    half +
    '"/><w:szCs w:val="' +
    half +
    '"/>' +
    '<w:lang w:val="mn-MN" w:eastAsia="mn-MN" w:bidi="ar-SA"/>' +
    "</w:rPr></w:rPrDefault>" +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    "</w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    Object.entries(doc.styles)
      .map(([name, style]) => styleXml(name, style))
      .join("") +
    '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    [1, 2, 3]
      .map(
        (level) =>
          '<w:style w:type="paragraph" w:styleId="TOC' +
          String(level) +
          '"><w:name w:val="toc ' +
          String(level) +
          '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>' +
          '<w:pPr><w:spacing w:after="100"/><w:ind w:left="' +
          String((level - 1) * 240) +
          '"/></w:pPr></w:style>',
      )
      .join("") +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
    '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
    '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar>' +
    '<w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>' +
    "</w:tblCellMar></w:tblPr></w:style>" +
    "</w:styles>"
  );
}

const NUMBERING_BULLET = 1;
const NUMBERING_DECIMAL = 2;

export const LIST_LEVELS = 9;
const BULLETS = ["•", "◦", "▪"];

export interface NumDef {
  readonly ordered: boolean;
  readonly start: number;
  readonly level: number;
}

function abstractNum(id: number, ordered: boolean): string {
  let levels = "";
  for (let level = 0; level < LIST_LEVELS; level += 1)
    levels +=
      '<w:lvl w:ilvl="' +
      String(level) +
      '"><w:start w:val="1"/><w:numFmt w:val="' +
      (ordered ? "decimal" : "bullet") +
      '"/><w:lvlText w:val="' +
      (ordered ? "%" + String(level + 1) + "." : BULLETS[level % 3]) +
      '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' +
      String(720 * (level + 1)) +
      '" w:hanging="360"/></w:pPr></w:lvl>';
  return (
    '<w:abstractNum w:abstractNumId="' +
    String(id) +
    '"><w:multiLevelType w:val="hybridMultilevel"/>' +
    levels +
    "</w:abstractNum>"
  );
}

export function numberingXml(nums: readonly NumDef[]): string {
  return (
    XML_HEAD +
    "<w:numbering " +
    NS_W +
    ">" +
    abstractNum(NUMBERING_BULLET, false) +
    abstractNum(NUMBERING_DECIMAL, true) +
    nums
      .map(
        (num, i) =>
          '<w:num w:numId="' +
          String(i + 1) +
          '"><w:abstractNumId w:val="' +
          String(num.ordered ? NUMBERING_DECIMAL : NUMBERING_BULLET) +
          '"/>' +
          (num.ordered
            ? '<w:lvlOverride w:ilvl="' +
              String(num.level) +
              '"><w:startOverride w:val="' +
              String(num.start) +
              '"/></w:lvlOverride>'
            : "") +
          "</w:num>",
      )
      .join("") +
    "</w:numbering>"
  );
}
