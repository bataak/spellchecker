import { cm } from "../units.ts";
import { TOC_LEVELS, type DocIr } from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";
import { NS, paraProps, pt, styleName, textProps } from "./props.ts";

export const LIST_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const BULLETS = ["\u2022", "\u25E6", "\u25AA"];

export function tocWidth(doc: DocIr): number {
  return doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm;
}

function extraStyles(doc: DocIr, base: string): string {
  return (
    '<style:style style:name="Rule" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:margin-top="6pt" fo:margin-bottom="6pt" ' +
    'fo:border-bottom="0.5pt solid #000000" fo:padding-bottom="2pt"/>' +
    "</style:style>" +
    '<style:style style:name="TOC_Heading" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:margin-bottom="12pt"/>' +
    '<style:text-properties fo:font-size="17pt" fo:font-weight="bold"/></style:style>' +
    TOC_LEVELS.map(
      (level) =>
        '<style:style style:name="TOC_' +
        String(level) +
        '" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-left="' +
        cm(0.5 * (level - 1)) +
        '" fo:margin-bottom="3pt"><style:tab-stops><style:tab-stop style:position="' +
        cm(tocWidth(doc) - 0.5 * (level - 1)) +
        '" style:type="right" style:leader-style="dotted" style:leader-text="."/>' +
        "</style:tab-stops></style:paragraph-properties></style:style>",
    ).join("") +
    '<style:style style:name="PageBreak" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:break-before="page"/></style:style>' +
    '<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-size="' +
    pt(doc.font.sizePt) +
    '" fo:font-family="' +
    xmlAttr(base) +
    '"/></style:style>'
  );
}

function listStyles(): string {
  return (
    '<text:list-style style:name="L_bullet">' +
    LIST_LEVELS.map(
      (level) =>
        '<text:list-level-style-bullet text:level="' +
        String(level) +
        '" text:bullet-char="' +
        BULLETS[(level - 1) % 3] +
        '">' +
        '<style:list-level-properties text:space-before="' +
        cm(0.6 * level) +
        '" text:min-label-width="0.6cm"/>' +
        "</text:list-level-style-bullet>",
    ).join("") +
    "</text:list-style>" +
    '<text:list-style style:name="L_num">' +
    LIST_LEVELS.map(
      (level) =>
        '<text:list-level-style-number text:level="' +
        String(level) +
        '" style:num-suffix="." style:num-format="1">' +
        '<style:list-level-properties text:space-before="' +
        cm(0.6 * level) +
        '" text:min-label-width="0.6cm"/>' +
        "</text:list-level-style-number>",
    ).join("") +
    "</text:list-style>"
  );
}

function pageLayout(page: DocIr["page"], name: string): string {
  return (
    '<style:page-layout style:name="' +
    name +
    '"><style:page-layout-properties ' +
    'fo:page-width="' +
    cm(page.widthCm) +
    '" fo:page-height="' +
    cm(page.heightCm) +
    '" style:print-orientation="portrait" ' +
    'fo:margin-top="' +
    cm(page.marginTopCm) +
    '" fo:margin-bottom="' +
    cm(page.marginBottomCm) +
    '" fo:margin-left="' +
    cm(page.marginInnerCm) +
    '" fo:margin-right="' +
    cm(page.marginOuterCm) +
    '" style:page-usage="' +
    (page.mirrored ? "mirrored" : "all") +
    '">' +
    '<style:footer-style><style:header-footer-properties fo:min-height="0.6cm" ' +
    'fo:margin-top="0.4cm"/></style:footer-style>' +
    "</style:page-layout-properties></style:page-layout>"
  );
}

export function stylesXml(doc: DocIr): string {
  const base = doc.font.family;

  const paragraphs = Object.entries(doc.styles)
    .map(
      ([name, style]) =>
        '<style:style style:name="' +
        styleName(name) +
        '" style:family="paragraph" style:parent-style-name="Standard">' +
        paraProps(style) +
        textProps(style, base) +
        "</style:style>",
    )
    .join("");

  const footerXml = doc.pageNumbers
    ? '<style:footer><text:p text:style-name="Footer">' +
      '<text:page-number text:select-page="current">1</text:page-number>' +
      "</text:p></style:footer>"
    : "";

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-styles" +
    NS +
    ' office:version="1.3">' +
    "<office:styles>" +
    '<style:style style:name="Standard" style:family="paragraph">' +
    '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" ' +
    'fo:hyphenation-ladder-count="2" fo:orphans="2" fo:widows="2"/>' +
    '<style:text-properties fo:font-size="' +
    pt(doc.font.sizePt) +
    '" fo:font-family="' +
    xmlAttr(base) +
    '" fo:language="mn" fo:country="MN" fo:hyphenate="true" ' +
    'fo:hyphenation-remain-char-count="3" ' +
    'fo:hyphenation-push-char-count="3"/></style:style>' +
    paragraphs +
    extraStyles(doc, base) +
    listStyles() +
    "</office:styles>" +
    "<office:automatic-styles>" +
    pageLayout(doc.page, "Page_Body") +
    "</office:automatic-styles>" +
    "<office:master-styles>" +
    '<style:master-page style:name="Standard" style:page-layout-name="Page_Body">' +
    footerXml +
    "</style:master-page>" +
    "</office:master-styles></office:document-styles>"
  );
}
