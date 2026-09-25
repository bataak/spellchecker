import { ODF_PRESENTATION, writeOdf } from "../odf/index.ts";
import type { DeckDoc, DeckLine } from "../deck.ts";
import type { IrRun } from "../docir.ts";

const encoder = new TextEncoder();

const FONT = "Liberation Sans";
const MONO = "Liberation Mono";

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
      ? '<text:span text:style-name="T_' + key + '">' + spaced(run.text) + "</text:span>"
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

function para(style: string, runs: readonly IrRun[], keys: Set<string>): string {
  return '<text:p text:style-name="' + style + '">' + runsXml(runs, keys) + "</text:p>";
}

function linesXml(lines: readonly DeckLine[], keys: Set<string>): string {
  let out = "";
  let open: "bullet" | "number" | null = null;
  const close = (): void => {
    if (open !== null) out += "</text:list>";
    open = null;
  };
  for (const line of lines) {
    if (line.kind === "para") {
      close();
      out += para("P_body", line.runs, keys);
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
      para("P_body", line.runs, keys) +
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

function page(index: number, frames: string): string {
  return (
    '<draw:page draw:name="page' +
    String(index) +
    '" draw:style-name="dp1" draw:master-page-name="Default">' +
    frames +
    "</draw:page>"
  );
}

const WIDTH = PAGE.width - 2 * MARGIN;

function contentXml(doc: DeckDoc): string {
  const keys = new Set<string>();
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
    if (slide.lines.length)
      frames += frame(
        "outline",
        "pr_body",
        { x: MARGIN, y: top, w: WIDTH, h: PAGE.height - top - 0.9 },
        linesXml(slide.lines, keys),
      );
    pages.push(page(pages.length + 1, frames));
  }

  const listLevel =
    '<style:list-level-properties text:space-before="0cm" text:min-label-width="0.9cm"/>' +
    '<style:text-properties fo:font-family="' + FONT + '" fo:font-size="100%"/>';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    '<style:style style:name="dp1" style:family="drawing-page"/>' +
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
    '<style:text-properties fo:font-family="' + FONT + '" fo:font-size="36pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_title" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="start"/>' +
    '<style:text-properties fo:font-family="' + FONT + '" fo:font-size="30pt" fo:font-weight="bold"/>' +
    "</style:style>" +
    '<style:style style:name="P_sub" style:family="paragraph">' +
    '<style:paragraph-properties fo:text-align="center"/>' +
    '<style:text-properties fo:font-family="' + FONT + '" fo:font-size="20pt"/>' +
    "</style:style>" +
    '<style:style style:name="P_body" style:family="paragraph">' +
    '<style:paragraph-properties fo:margin-bottom="0.2cm"/>' +
    '<style:text-properties fo:font-family="' + FONT + '" fo:font-size="20pt"/>' +
    "</style:style>" +
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

function manifestXml(): string {
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
    "</manifest:manifest>"
  );
}

export function buildOdp(doc: DeckDoc): Uint8Array<ArrayBuffer> {
  return writeOdf({
    entries: {
      mimetype: encoder.encode(ODF_PRESENTATION),
      "META-INF/manifest.xml": encoder.encode(manifestXml()),
      "content.xml": encoder.encode(contentXml(doc)),
      "styles.xml": encoder.encode(stylesXml()),
    },
    order: ["META-INF/manifest.xml", "content.xml", "styles.xml"],
    mimetype: ODF_PRESENTATION,
  });
}
