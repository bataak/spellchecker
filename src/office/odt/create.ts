import { odfFont } from "../fonts.ts";
import { ODF_TEXT, manifestXml, writeOdf } from "../odf/index.ts";
import type { OdfPackage } from "../odf/index.ts";
import {
  TOC_LEVELS,
  TOC_TITLE,
  blockRuns,
  outlineLevel,
  runsText,
  tocEntries,
  withToc,
} from "../docir.ts";
import type { DocIr, ImageFiles, IrBlock, IrRun } from "../docir.ts";
import { listTree, type ListTree } from "../../markdown.ts";
import { xmlText } from "../sanitize.ts";
import { NS, runKey, runStyle, styleName } from "./props.ts";
import { stylesXml } from "./styles.ts";
import { type Media, runsXml, paraXml } from "./createruns.ts";
import { tableXml } from "./createtable.ts";

const encoder = new TextEncoder();

function listXml(
  block: Extract<IrBlock, { kind: "list" }>,
  media: Media,
): string {
  const render = (tree: ListTree<readonly IrRun[]>): string =>
    '<text:list text:style-name="' +
    (tree.ordered ? "L_num" : "L_bullet") +
    '">' +
    tree.entries
      .map(
        ({ item, sub }, i) =>
          "<text:list-item" +
          (i === 0 && tree.ordered && tree.start !== 1
            ? ' text:start-value="' + String(tree.start) + '"'
            : "") +
          '><text:p text:style-name="' +
          styleName(block.style) +
          '">' +
          runsXml(item, media) +
          "</text:p>" +
          (sub ? render(sub) : "") +
          "</text:list-item>",
      )
      .join("") +
    "</text:list>";
  return render(listTree(block));
}

function blockXml(
  block: IrBlock,
  index: number,
  doc: DocIr,
  auto: Set<string>,
  media: Media,
): string {
  switch (block.kind) {
    case "para":
      return paraXml(
        block.style,
        block.runs,
        outlineLevel(doc, block.style),
        media,
        block.verbatim === true,
      );
    case "list":
      return listXml(block, media);
    case "table":
      return tableXml(block, index, doc, auto, media);
    case "rule":
      return '<text:p text:style-name="Rule"/>';
    case "break":
      return '<text:p text:style-name="PageBreak"/>';
  }
}

export interface OdtOptions {
  readonly toc?: boolean;
  readonly images?: ImageFiles;
}

function tocXml(doc: DocIr): string {
  const templates = TOC_LEVELS.map(
    (level) =>
      '<text:table-of-content-entry-template text:outline-level="' +
      String(level) +
      '" text:style-name="TOC_' +
      String(level) +
      '"><text:index-entry-link-start/><text:index-entry-text/>' +
      '<text:index-entry-tab-stop style:type="right" style:leader-char="."/>' +
      "<text:index-entry-page-number/><text:index-entry-link-end/>" +
      "</text:table-of-content-entry-template>",
  ).join("");
  const entries = tocEntries(doc)
    .map(
      ({ level, runs }) =>
        '<text:p text:style-name="TOC_' +
        String(level) +
        '">' +
        xmlText(runsText(runs).replace(/\s*\n\s*/g, " ")) +
        "<text:tab/></text:p>",
    )
    .join("");
  return (
    '<text:table-of-content text:protected="true" text:name="TOC">' +
    '<text:table-of-content-source text:outline-level="3">' +
    '<text:index-title-template text:style-name="TOC_Heading">' +
    TOC_TITLE +
    "</text:index-title-template>" +
    templates +
    "</text:table-of-content-source><text:index-body>" +
    '<text:index-title text:name="TOC_Head">' +
    '<text:p text:style-name="TOC_Heading">' +
    TOC_TITLE +
    "</text:p>" +
    "</text:index-title>" +
    entries +
    "</text:index-body></text:table-of-content>" +
    '<text:p text:style-name="PageBreak"/>'
  );
}

function contentXml(doc: DocIr, options: OdtOptions, media: Media): string {
  const keys = new Set(doc.blocks.flatMap(blockRuns).map(runKey));
  keys.delete("");

  const spans = [...keys].map((key) => runStyle(key, doc.font.family)).join("");

  const auto = new Set<string>();
  const parts = doc.blocks.map((block, index) =>
    blockXml(block, index, doc, auto, media),
  );
  if (options.toc) withToc(doc, parts, tocXml(doc));
  const body = parts.join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    (media.frames
      ? '<style:style style:name="Fimage" style:family="graphic">' +
        '<style:graphic-properties style:vertical-pos="top" ' +
        'style:vertical-rel="baseline" fo:border="none" fo:padding="0cm"/>' +
        "</style:style>"
      : "") +
    spans +
    [...auto].join("") +
    "</office:automatic-styles>" +
    "<office:body><office:text>" +
    body +
    "</office:text></office:body></office:document-content>"
  );
}

function metaXml(doc: DocIr): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-meta" +
    NS +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"' +
    ' office:version="1.3"><office:meta>' +
    (doc.title ? "<dc:title>" + xmlText(doc.title) + "</dc:title>" : "") +
    "<dc:language>mn-MN</dc:language>" +
    "<meta:generator>bichig.dev</meta:generator>" +
    "<meta:creation-date>" +
    new Date().toISOString().slice(0, 19) +
    "</meta:creation-date>" +
    "</office:meta></office:document-meta>"
  );
}

export function buildOdt(
  doc: DocIr,
  options: OdtOptions = {},
): Uint8Array<ArrayBuffer> {
  doc = { ...doc, font: { ...doc.font, family: odfFont(doc.font.family) } };
  const used = new Map<string, string>();
  const content = contentXml(doc, options, {
    images: options.images ?? new Map(),
    page: doc.page,
    used,
    frames: 0,
  });
  const pictures = [...used.values()];
  const entries: Record<string, Uint8Array> = {
    mimetype: encoder.encode(ODF_TEXT),
    "META-INF/manifest.xml": encoder.encode(
      manifestXml(
        ODF_TEXT,
        ["content.xml", "styles.xml", "meta.xml"],
        pictures,
      ),
    ),
    "content.xml": encoder.encode(content),
    "styles.xml": encoder.encode(stylesXml(doc)),
    "meta.xml": encoder.encode(metaXml(doc)),
  };
  for (const [key, path] of used)
    entries[path] = options.images!.get(key)!.bytes;

  const pkg: OdfPackage = {
    entries,
    order: [
      "META-INF/manifest.xml",
      "content.xml",
      "styles.xml",
      "meta.xml",
      ...pictures,
    ],
    mimetype: ODF_TEXT,
  };

  return writeOdf(pkg);
}
