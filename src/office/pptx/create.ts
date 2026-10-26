import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import { mapDeck } from "../deck.ts";
import type { DeckDoc, DeckLine, DeckPart } from "../deck.ts";
import {
  TABLE_PT,
  TEXT_PT,
  layoutSlide,
  type PlacedImage,
} from "../decklayout.ts";
import { imageKey } from "../docir.ts";
import type { ImageFiles, IrRun } from "../docir.ts";
import { REL, relsXml, type Rel } from "../ooxml.ts";
import {
  HEIGHT,
  LAYOUT,
  MASTER,
  THEME,
  WIDTH,
  contentTypesXml,
  presentationXml,
} from "./parts.ts";
import { NOTES_MASTER, notesSlideXml } from "./notes.ts";
import {
  EMU_CM,
  linesXml,
  paraXml,
  shape,
  type SlideState,
  slideXml,
  tableXml,
} from "./shapes.ts";

export interface PptxOptions {
  readonly images?: ImageFiles;
}

const encoder = new TextEncoder();

const MARGIN = Math.round(1.7 * EMU_CM);

interface BuiltSlide {
  readonly xml: string;
  readonly links: readonly Rel[];
  readonly notes?: readonly DeckLine[];
}

const NOTES_PT = 12;

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

function deckSlides(doc: DeckDoc, media: Media): BuiltSlide[] {
  return mapDeck<BuiltSlide>(doc, {
    cover: (title) => coverSlide(doc, title),
    section: (slide) => sectionSlide(slide.title ?? []),
    content: (slide) => ({
      ...contentSlide(slide.title, slide.parts, media),
      notes: slide.notes,
    }),
  });
}

function packageParts(
  built: readonly BuiltSlide[],
  media: Media,
  noted: readonly number[],
): Record<string, string> {
  return {
    "[Content_Types].xml": contentTypesXml(
      built.length,
      [
        ...new Set(
          [...media.names.values()].map((name) => name.split(".")[1]!),
        ),
      ],
      noted,
    ),
    "_rels/.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/officeDocument",
        target: "ppt/presentation.xml",
      },
    ]),
    "ppt/presentation.xml": presentationXml(built.length, noted.length > 0),
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
      ...(noted.length
        ? [
            {
              id: "rIdNotes",
              type: REL + "/notesMaster",
              target: "notesMasters/notesMaster1.xml",
            },
          ]
        : []),
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
}

function notesParts(files: Record<string, string>): void {
  files["ppt/notesMasters/notesMaster1.xml"] = NOTES_MASTER;
  files["ppt/notesMasters/_rels/notesMaster1.xml.rels"] = relsXml([
    { id: "rId1", type: REL + "/theme", target: "../theme/theme2.xml" },
  ]);
  files["ppt/theme/theme2.xml"] = THEME;
}

function slideParts(
  files: Record<string, string>,
  slide: BuiltSlide,
  i: number,
): void {
  const name = "slide" + String(i + 1) + ".xml";
  const notesName = "notesSlide" + String(i + 1) + ".xml";
  const hasNotes = Boolean(slide.notes?.length);
  files["ppt/slides/" + name] = slide.xml;
  files["ppt/slides/_rels/" + name + ".rels"] = relsXml([
    {
      id: "rId1",
      type: REL + "/slideLayout",
      target: "../slideLayouts/slideLayout1.xml",
    },
    ...slide.links,
    ...(hasNotes
      ? [
          {
            id: "rIdNotes",
            type: REL + "/notesSlide",
            target: "../notesSlides/" + notesName,
          },
        ]
      : []),
  ]);
  if (!hasNotes) return;
  const state: SlideState = { links: [], shapeId: 4 };
  files["ppt/notesSlides/" + notesName] = notesSlideXml(
    linesXml(slide.notes!, state, NOTES_PT * 100),
  );
  files["ppt/notesSlides/_rels/" + notesName + ".rels"] = relsXml([
    {
      id: "rId1",
      type: REL + "/notesMaster",
      target: "../notesMasters/notesMaster1.xml",
    },
    { id: "rIdSlide", type: REL + "/slide", target: "../slides/" + name },
    ...state.links,
  ]);
}

export function buildPptx(
  doc: DeckDoc,
  options: PptxOptions = {},
): Uint8Array<ArrayBuffer> {
  const media: Media = {
    images: options.images ?? new Map(),
    names: new Map(),
  };
  const built = deckSlides(doc, media);
  const noted = built.flatMap((slide, i) =>
    slide.notes?.length ? [i + 1] : [],
  );
  const files = packageParts(built, media, noted);
  if (noted.length) notesParts(files);
  built.forEach((slide, i) => slideParts(files, slide, i));
  const zippable: Zippable = {};
  for (const [name, xml] of Object.entries(files))
    zippable[name] = encoder.encode(xml);
  for (const [key, name] of media.names)
    zippable["ppt/media/" + name] = media.images.get(key)!.bytes;
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
