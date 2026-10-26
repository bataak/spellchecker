import { ODF_PRESENTATION, manifestXml, writeOdf } from "../odf/index.ts";
import { mapDeck } from "../deck.ts";
import type { DeckDoc, DeckSlide } from "../deck.ts";
import {
  TABLE_PT,
  TEXT_PT,
  layoutSlide,
  type PlacedImage,
} from "../decklayout.ts";
import { imageKey } from "../docir.ts";
import type { ImageFiles, IrRun } from "../docir.ts";
import { fixedStyles, listStyles } from "./styles.ts";

import {
  cm,
  FONT,
  frame,
  linesXml,
  MARGIN,
  NS,
  PAGE,
  page,
  para,
  runStyle,
} from "./text.ts";
import { type Auto, bodyStyle, tableXml, WIDTH } from "./table.ts";

export interface OdpOptions {
  readonly images?: ImageFiles;
}

interface Media {
  readonly images: ImageFiles;
  readonly paths: Map<string, string>;
}

function imageXml(media: Media, placed: PlacedImage): string {
  const key = imageKey(placed.image);
  const file = media.images.get(key);
  if (!file) return "";
  let path = media.paths.get(key);
  if (path === undefined) {
    path = "Pictures/image" + String(media.paths.size + 1) + "." + file.ext;
    media.paths.set(key, path);
  }
  return (
    '<draw:frame draw:style-name="gr_img" svg:x="' +
    cm(placed.x) +
    '" svg:y="' +
    cm(placed.y) +
    '" svg:width="' +
    cm(placed.w) +
    '" svg:height="' +
    cm(placed.h) +
    '"><draw:image xlink:href="' +
    path +
    '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' +
    "</draw:frame>"
  );
}

const encoder = new TextEncoder();

function coverPage(
  doc: DeckDoc,
  title: readonly IrRun[],
  keys: Set<string>,
): string {
  let frames = frame(
    "title",
    "pr_title",
    { x: MARGIN, y: 4, w: WIDTH, h: 3.2 },
    para("P_cover", title, keys),
  );
  if (doc.subtitle.length)
    frames += frame(
      "subtitle",
      "pr_body",
      { x: MARGIN, y: 7.8, w: WIDTH, h: 4 },
      doc.subtitle.map((line) => para("P_sub", line, keys)).join(""),
    );
  return frames;
}

function sectionFrame(slide: DeckDoc["slides"][number], keys: Set<string>) {
  return frame(
    "title",
    "pr_title",
    { x: MARGIN, y: 5.5, w: WIDTH, h: 3.2 },
    para("P_cover", slide.title ?? [], keys),
  );
}

function slideFrames(
  slide: DeckDoc["slides"][number],
  media: Media,
  auto: Auto,
  keys: Set<string>,
): string {
  let frames = "";
  let top = MARGIN;
  if (slide.title !== null) {
    frames += frame(
      "title",
      "pr_title",
      { x: MARGIN, y: 0.6, w: WIDTH, h: 2.2 },
      para("P_title", slide.title, keys),
    );
    top = 3.2;
  }
  const layout = layoutSlide(
    slide.parts,
    MARGIN,
    top,
    WIDTH,
    PAGE.height - top - 0.9,
    (image) => media.images.get(imageKey(image)),
  );
  for (const part of layout.parts)
    frames +=
      part.kind === "image"
        ? part.items.map((item) => imageXml(media, item)).join("")
        : part.kind === "text"
          ? frame(
              "outline",
              "pr_body",
              { x: MARGIN, y: part.y, w: WIDTH, h: part.h },
              linesXml(
                part.lines,
                keys,
                bodyStyle(auto, TEXT_PT * layout.scale),
              ),
            )
          : tableXml(
              auto,
              keys,
              part.table,
              part.layout,
              part,
              TABLE_PT * layout.scale,
            );
  return frames;
}

function contentXml(doc: DeckDoc, media: Media): string {
  const keys = new Set<string>();
  const auto: Auto = { styles: new Map(), tables: 0 };
  const withNotes =
    (frames: (slide: DeckSlide) => string) =>
    (slide: DeckSlide): readonly [string, string] => {
      const notes = slide.notes.length ? linesXml(slide.notes, keys) : "";
      return [frames(slide), notes] as const;
    };
  const pages = mapDeck<readonly [string, string]>(doc, {
    cover: (title) => [coverPage(doc, title, keys), ""],
    section: withNotes((slide) => sectionFrame(slide, keys)),
    content: withNotes((slide) => slideFrames(slide, media, auto, keys)),
  }).map(([frames, notes], index) => page(index + 1, frames, notes));
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    fixedStyles(media.paths.size > 0) +
    [...auto.styles.values()].join("") +
    [...keys].map(runStyle).join("") +
    listStyles() +
    "</office:automatic-styles>" +
    "<office:body><office:presentation>" +
    pages.join("") +
    "</office:presentation></office:body></office:document-content>"
  );
}

function stylesXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-styles" +
    NS +
    ' office:version="1.3">' +
    "<office:styles>" +
    '<style:default-style style:family="graphic">' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '"/>' +
    "</style:default-style>" +
    '<style:default-style style:family="presentation">' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '"/>' +
    "</style:default-style>" +
    "</office:styles>" +
    "<office:automatic-styles>" +
    '<style:page-layout style:name="PM1">' +
    '<style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" ' +
    'fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="' +
    cm(PAGE.width) +
    '" fo:page-height="' +
    cm(PAGE.height) +
    '" style:print-orientation="landscape"/>' +
    "</style:page-layout>" +
    '<style:style style:name="dpm" style:family="drawing-page">' +
    '<style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffffff"/>' +
    "</style:style>" +
    "</office:automatic-styles>" +
    "<office:master-styles>" +
    '<style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="dpm"/>' +
    "</office:master-styles>" +
    "</office:document-styles>"
  );
}

export function buildOdp(
  doc: DeckDoc,
  options: OdpOptions = {},
): Uint8Array<ArrayBuffer> {
  const media: Media = {
    images: options.images ?? new Map(),
    paths: new Map(),
  };
  const content = contentXml(doc, media);
  const pictures = [...media.paths.values()];
  const entries: Record<string, Uint8Array> = {
    mimetype: encoder.encode(ODF_PRESENTATION),
    "META-INF/manifest.xml": encoder.encode(
      manifestXml(ODF_PRESENTATION, ["content.xml", "styles.xml"], pictures),
    ),
    "content.xml": encoder.encode(content),
    "styles.xml": encoder.encode(stylesXml()),
  };
  for (const [key, path] of media.paths)
    entries[path] = media.images.get(key)!.bytes;
  return writeOdf({
    entries,
    order: ["META-INF/manifest.xml", "content.xml", "styles.xml", ...pictures],
    mimetype: ODF_PRESENTATION,
  });
}
