import { odfFont } from "../fonts.ts";
import { ODF_PRESENTATION, writeOdf } from "../odf/index.ts";
import type { DeckDoc, DeckLine, DeckTable } from "../deck.ts";
import {
  TABLE_PT,
  TEXT_PT,
  layoutSlide,
  type PlacedImage,
  type TableLayout,
} from "../decklayout.ts";
import { imageKey } from "../docir.ts";
import type { Align, ImageFiles, IrRun } from "../docir.ts";

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

const FONT = odfFont("Arial");
const MONO = odfFont("Courier New");

const PAGE = { width: 28, height: 15.75 };
const MARGIN = 1.4;

const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"' +
  ' xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
  ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
  ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
  ' xmlns:xlink="http://www.w3.org/1999/xlink"';

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(value: string): string {
  return esc(value).replace(/"/g, "&quot;");
}

function cm(value: number): string {
  return value.toFixed(2) + "cm";
}

function spaced(text: string): string {
  return text.split("\n").map(spacedLine).join("<text:line-break/>");
}

function spacedLine(text: string): string {
  return text
    .split(/( {2,}|^ |\t)/)
    .map((part) => {
      if (part === "\t") return "<text:tab/>";
      if (/^ +$/.test(part))
        return part.length === 1
          ? "<text:s/>"
          : '<text:s text:c="' + String(part.length) + '"/>';
      return esc(part);
    })
    .join("");
}

function runKey(run: IrRun): string {
  return (
    (run.bold ? "b" : "") +
    (run.italic ? "i" : "") +
    (run.mono ? "m" : "") +
    (run.strike ? "s" : "")
  );
}

function runStyle(key: string): string {
  const parts: string[] = [];
  if (key.includes("b")) parts.push('fo:font-weight="bold"');
  if (key.includes("i")) parts.push('fo:font-style="italic"');
  if (key.includes("s")) parts.push('style:text-line-through-style="solid"');
  if (key.includes("m")) parts.push('fo:font-family="' + MONO + '"');
  return (
    '<style:style style:name="T_' +
    key +
    '" style:family="text"><style:text-properties ' +
    parts.join(" ") +
    "/></style:style>"
  );
}

function runsXml(runs: readonly IrRun[], keys: Set<string>): string {
  let out = "";
  for (const run of runs) {
    if (!run.text) continue;
    const key = runKey(run);
    if (key) keys.add(key);
    const body = key
      ? '<text:span text:style-name="T_' +
        key +
        '">' +
        spaced(run.text) +
        "</text:span>"
      : spaced(run.text);
    out += run.href
      ? '<text:a xlink:type="simple" xlink:href="' +
        escAttr(run.href) +
        '">' +
        body +
        "</text:a>"
      : body;
  }
  return out;
}

function para(
  style: string,
  runs: readonly IrRun[],
  keys: Set<string>,
): string {
  return (
    '<text:p text:style-name="' +
    style +
    '">' +
    runsXml(runs, keys) +
    "</text:p>"
  );
}

function linesXml(
  lines: readonly DeckLine[],
  keys: Set<string>,
  style = "P_body",
): string {
  let out = "";
  let open: "bullet" | "number" | null = null;
  const close = (): void => {
    if (open !== null) out += "</text:list>";
    open = null;
  };
  for (const line of lines) {
    if (line.kind === "para") {
      close();
      out += para(style, line.runs, keys);
      continue;
    }
    if (open !== line.kind || line.start !== undefined) {
      close();
      out +=
        '<text:list text:style-name="' +
        (line.kind === "bullet" ? "L_bullet" : "L_number") +
        '">';
      open = line.kind;
    }
    out +=
      "<text:list-item" +
      (line.start !== undefined && line.start !== 1
        ? ' text:start-value="' + String(line.start) + '"'
        : "") +
      ">" +
      para(style, line.runs, keys) +
      "</text:list-item>";
  }
  close();
  return out;
}

function frame(
  cls: string,
  style: string,
  box: { x: number; y: number; w: number; h: number },
  inner: string,
): string {
  return (
    '<draw:frame presentation:class="' +
    cls +
    '" presentation:style-name="' +
    style +
    '" svg:x="' +
    cm(box.x) +
    '" svg:y="' +
    cm(box.y) +
    '" svg:width="' +
    cm(box.w) +
    '" svg:height="' +
    cm(box.h) +
    '"><draw:text-box>' +
    inner +
    "</draw:text-box></draw:frame>"
  );
}

function page(index: number, frames: string, notes = ""): string {
  return (
    '<draw:page draw:name="page' +
    String(index) +
    '" draw:style-name="dp1" draw:master-page-name="Default">' +
    frames +
    (notes
      ? "<presentation:notes>" +
        frame("notes", "pr_body", { x: 2, y: 14, w: 17, h: 12 }, notes) +
        "</presentation:notes>"
      : "") +
    "</draw:page>"
  );
}

const WIDTH = PAGE.width - 2 * MARGIN;

const ALIGN: Readonly<Record<Align, string>> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

const RULE = { heavy: "1.5pt solid #000000", light: "0.75pt solid #000000" };

interface Auto {
  readonly styles: Map<string, string>;
  tables: number;
}

function sizeName(pt: number): string {
  return String(Math.round(pt * 10));
}

function bodyStyle(auto: Auto, pt: number): string {
  const name = "P_body_" + sizeName(pt);
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="paragraph">' +
      '<style:paragraph-properties fo:margin-bottom="0.2cm"/>' +
      '<style:text-properties fo:font-family="' +
      FONT +
      '" fo:font-size="' +
      (Math.round(pt * 10) / 10).toFixed(1) +
      'pt"/></style:style>',
  );
  return name;
}

function cellParaStyle(auto: Auto, align: Align | null, pt: number): string {
  const name = "P_cell_" + (align ?? "none") + "_" + sizeName(pt);
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="paragraph">' +
      (align
        ? '<style:paragraph-properties fo:text-align="' + ALIGN[align] + '"/>'
        : "") +
      '<style:text-properties fo:font-family="' +
      FONT +
      '" fo:font-size="' +
      (Math.round(pt * 10) / 10).toFixed(1) +
      'pt"/></style:style>',
  );
  return name;
}

function cellStyle(
  auto: Auto,
  top: string | null,
  bottom: string | null,
  middle: boolean,
): string {
  const key =
    (top ? "T" : "") +
    (bottom === RULE.heavy ? "B" : bottom ? "b" : "") +
    (middle ? "m" : "");
  const name = "ce_" + (key || "plain");
  const edge = (side: string, value: string | null): string =>
    "fo:border-" + side + '="' + (value ?? "none") + '"';
  auto.styles.set(
    name,
    '<style:style style:name="' +
      name +
      '" style:family="table-cell">' +
      '<style:graphic-properties draw:fill="none" draw:textarea-vertical-align="' +
      (middle ? "middle" : "top") +
      '" fo:padding-top="0.12cm" fo:padding-bottom="0.12cm" ' +
      'fo:padding-left="0.25cm" fo:padding-right="0.25cm"/>' +
      "<style:paragraph-properties " +
      edge("top", top) +
      " " +
      edge("bottom", bottom) +
      ' fo:border-left="none" fo:border-right="none"/>' +
      "</style:style>",
  );
  return name;
}

function tableXml(
  auto: Auto,
  keys: Set<string>,
  table: DeckTable,
  layout: TableLayout,
  box: { x: number; y: number },
  pt: number,
): string {
  auto.tables += 1;
  const id = String(auto.tables);
  const columns = layout.widths
    .map((width, c) => {
      const name = "co" + id + "_" + String(c);
      auto.styles.set(
        name,
        '<style:style style:name="' +
          name +
          '" style:family="table-column"><style:table-column-properties style:column-width="' +
          cm(width) +
          '"/></style:style>',
      );
      return '<table:table-column table:style-name="' + name + '"/>';
    })
    .join("");
  const last = table.rows.length - 1;
  const rows = table.rows
    .map((row, r) => {
      const head = table.header && r === 0;
      const rowName = "ro" + id + "_" + String(r);
      auto.styles.set(
        rowName,
        '<style:style style:name="' +
          rowName +
          '" style:family="table-row"><style:table-row-properties style:row-height="' +
          cm(layout.heights[r]!) +
          '"/></style:style>',
      );
      const cells = layout.widths
        .map((_, c) => {
          const style = cellStyle(
            auto,
            r === 0 ? RULE.heavy : null,
            r === last ? RULE.heavy : head ? RULE.light : null,
            head,
          );
          const runs = (row[c] ?? []).map((run) =>
            head ? { ...run, bold: true } : run,
          );
          return (
            '<table:table-cell table:style-name="' +
            style +
            '">' +
            para(cellParaStyle(auto, table.align[c] ?? null, pt), runs, keys) +
            "</table:table-cell>"
          );
        })
        .join("");
      return (
        '<table:table-row table:style-name="' +
        rowName +
        '">' +
        cells +
        "</table:table-row>"
      );
    })
    .join("");
  const width = layout.widths.reduce((a, b) => a + b, 0);
  const height = layout.heights.reduce((a, b) => a + b, 0);
  return (
    '<draw:frame draw:style-name="gr_table" svg:x="' +
    cm(box.x) +
    '" svg:y="' +
    cm(box.y) +
    '" svg:width="' +
    cm(width) +
    '" svg:height="' +
    cm(height) +
    '"><table:table>' +
    columns +
    rows +
    "</table:table></draw:frame>"
  );
}

function contentXml(doc: DeckDoc, media: Media): string {
  const keys = new Set<string>();
  const auto: Auto = { styles: new Map(), tables: 0 };
  const pages: string[] = [];

  if (doc.title !== null) {
    let frames = frame(
      "title",
      "pr_title",
      { x: MARGIN, y: 4, w: WIDTH, h: 3.2 },
      para("P_cover", doc.title, keys),
    );
    if (doc.subtitle.length)
      frames += frame(
        "subtitle",
        "pr_body",
        { x: MARGIN, y: 7.8, w: WIDTH, h: 4 },
        doc.subtitle.map((line) => para("P_sub", line, keys)).join(""),
      );
    pages.push(page(pages.length + 1, frames));
  }

  for (const slide of doc.slides) {
    const notes = slide.notes.length ? linesXml(slide.notes, keys) : "";
    if (slide.section) {
      pages.push(
        page(
          pages.length + 1,
          frame(
            "title",
            "pr_title",
            { x: MARGIN, y: 5.5, w: WIDTH, h: 3.2 },
            para("P_cover", slide.title ?? [], keys),
          ),
          notes,
        ),
      );
      continue;
    }
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
    pages.push(page(pages.length + 1, frames, notes));
  }

  const listLevel =
    '<style:list-level-properties text:space-before="0cm" text:min-label-width="0.9cm"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="100%"/>';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    '<style:style style:name="dp1" style:family="drawing-page"/>' +
    (media.paths.size
      ? '<style:style style:name="gr_img" style:family="graphic">' +
        '<style:graphic-properties draw:stroke="none" draw:fill="none"/>' +
        "</style:style>"
      : "") +
    '<style:style style:name="pr_title" style:family="presentation">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none" ' +
    'draw:auto-grow-height="false" draw:textarea-vertical-align="middle"/>' +
    "</style:style>" +
    '<style:style style:name="pr_body" style:family="presentation">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none" ' +
    'draw:auto-grow-height="false" draw:textarea-vertical-align="top" ' +
    'style:shrink-to-fit="true"/>' +
    "</style:style>" +
    '<style:style style:name="P_cover" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="36pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_title" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="start"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="30pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_sub" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="20pt"/>' +
    "</style:style>" +
    '<style:style style:name="P_body" style:family="paragraph">' +
    '<style:paragraph-properties fo:margin-bottom="0.2cm"/>' +
    '<style:text-properties fo:font-family="' +
    FONT +
    '" fo:font-size="20pt"/>' +
    "</style:style>" +
    '<style:style style:name="gr_table" style:family="graphic">' +
    '<style:graphic-properties draw:stroke="none" draw:fill="none"/>' +
    "</style:style>" +
    [...auto.styles.values()].join("") +
    [...keys].map(runStyle).join("") +
    '<text:list-style style:name="L_bullet">' +
    '<text:list-level-style-bullet text:level="1" text:bullet-char="•">' +
    listLevel +
    "</text:list-level-style-bullet></text:list-style>" +
    '<text:list-style style:name="L_number">' +
    '<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">' +
    listLevel +
    "</text:list-level-style-number></text:list-style>" +
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

function manifestXml(pictures: readonly string[]): string {
  const entry = (path: string, type: string): string =>
    '<manifest:file-entry manifest:full-path="' +
    path +
    '" manifest:media-type="' +
    type +
    '"/>';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"' +
    ' manifest:version="1.3">' +
    entry("/", ODF_PRESENTATION) +
    entry("content.xml", "text/xml") +
    entry("styles.xml", "text/xml") +
    pictures
      .map((path) =>
        entry(path, "image/" + path.slice(path.lastIndexOf(".") + 1)),
      )
      .join("") +
    "</manifest:manifest>"
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
    "META-INF/manifest.xml": encoder.encode(manifestXml(pictures)),
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
