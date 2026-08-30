import { ODF_TEXT, writeOdf } from "../odf/index.ts";
import type { OdfPackage } from "../odf/index.ts";
import type { DocIr, IrBlock, IrRun, ParaStyle } from "../docir.ts";

const encoder = new TextEncoder();

const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
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
  return value.toFixed(3) + "cm";
}

function pt(value: number): string {
  return value.toFixed(1) + "pt";
}

const ALIGN: Record<string, string> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

function paraProps(style: ParaStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push('fo:text-align="' + ALIGN[style.align] + '"');
  if (style.lineHeightPercent !== undefined)
    parts.push('fo:line-height="' + String(style.lineHeightPercent) + '%"');
  if (style.firstLineIndentCm !== undefined)
    parts.push('fo:text-indent="' + cm(style.firstLineIndentCm) + '"');
  if (style.marginLeftCm !== undefined)
    parts.push('fo:margin-left="' + cm(style.marginLeftCm) + '"');
  if (style.marginRightCm !== undefined)
    parts.push('fo:margin-right="' + cm(style.marginRightCm) + '"');
  if (style.spaceBeforePt !== undefined)
    parts.push('fo:margin-top="' + pt(style.spaceBeforePt) + '"');
  if (style.spaceAfterPt !== undefined)
    parts.push('fo:margin-bottom="' + pt(style.spaceAfterPt) + '"');
  if (style.breakBefore) parts.push('fo:break-before="page"');
  if (style.keepWithNext) parts.push('fo:keep-with-next="always"');
  parts.push('fo:orphans="2"', 'fo:widows="2"');
  return "<style:paragraph-properties " + parts.join(" ") + "/>";
}

function textProps(style: ParaStyle, base: string): string {
  const parts: string[] = [];
  if (style.sizePt !== undefined)
    parts.push('fo:font-size="' + pt(style.sizePt) + '"');
  if (style.bold) parts.push('fo:font-weight="bold"');
  if (style.italic) parts.push('fo:font-style="italic"');
  if (style.mono)
    parts.push(
      'style:font-name="Liberation Mono"',
      'fo:font-family="&apos;Liberation Mono&apos;"',
    );
  else parts.push('fo:font-family="' + escAttr(base) + '"');
  if (parts.length === 0) return "";
  return "<style:text-properties " + parts.join(" ") + "/>";
}

function runKey(run: IrRun): string {
  return (
    (run.bold ? "b" : "") +
    (run.italic ? "i" : "") +
    (run.mono ? "m" : "") +
    (run.strike ? "s" : "") +
    (run.href ? "l" : "")
  );
}

function runStyle(key: string, base: string): string {
  const parts: string[] = [];
  if (key.includes("b")) parts.push('fo:font-weight="bold"');
  if (key.includes("i")) parts.push('fo:font-style="italic"');
  if (key.includes("s"))
    parts.push('style:text-line-through-style="solid"');
  if (key.includes("m"))
    parts.push(
      'style:font-name="Liberation Mono"',
      'fo:font-family="&apos;Liberation Mono&apos;"',
    );
  else parts.push('fo:font-family="' + escAttr(base) + '"');
  return (
    '<style:style style:name="T_' +
    (key || "plain") +
    '" style:family="text"><style:text-properties ' +
    parts.join(" ") +
    "/></style:style>"
  );
}

function runsXml(runs: readonly IrRun[]): string {
  let out = "";
  for (const run of runs) {
    if (!run.text) continue;
    const key = runKey(run);
    const body =
      key === ""
        ? esc(run.text)
        : '<text:span text:style-name="T_' +
          key +
          '">' +
          esc(run.text) +
          "</text:span>";
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

function styleName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function paraXml(style: string, runs: readonly IrRun[], level: number): string {
  if (level > 0)
    return (
      '<text:h text:style-name="' +
      styleName(style) +
      '" text:outline-level="' +
      String(level) +
      '">' +
      runsXml(runs) +
      "</text:h>"
    );
  return (
    '<text:p text:style-name="' +
    styleName(style) +
    '">' +
    runsXml(runs) +
    "</text:p>"
  );
}

function blockXml(block: IrBlock, index: number, doc: DocIr): string {
  switch (block.kind) {
    case "para":
      return paraXml(
        block.style,
        block.runs,
        doc.styles[block.style]?.outlineLevel ?? 0,
      );

    case "list": {
      const name = block.ordered ? "L_num" : "L_bullet";
      const items = block.items
        .map(
          (item) =>
            '<text:list-item><text:p text:style-name="' +
            styleName(block.style) +
            '">' +
            runsXml(item) +
            "</text:p></text:list-item>",
        )
        .join("");
      return '<text:list text:style-name="' + name + '">' + items + "</text:list>";
    }

    case "table": {
      const width = Math.max(...block.rows.map((r) => r.length), 1);
      const name = "Table" + String(index + 1);
      const columns =
        '<table:table-column table:number-columns-repeated="' +
        String(width) +
        '"/>';
      const rows = block.rows
        .map((row, rowIndex) => {
          const cells = Array.from({ length: width }, (_, i) => {
            const style = rowIndex === 0 ? "TableHead" : "TableCell";
            return (
              '<table:table-cell office:value-type="string"><text:p text:style-name="' +
              style +
              '">' +
              runsXml(row[i] ?? []) +
              "</text:p></table:table-cell>"
            );
          }).join("");
          return "<table:table-row>" + cells + "</table:table-row>";
        })
        .join("");
      return (
        '<table:table table:name="' +
        name +
        '">' +
        columns +
        rows +
        "</table:table>"
      );
    }

    case "rule":
      return '<text:p text:style-name="Rule"/>';

    case "break":
      return '<text:p text:style-name="PageBreak"/>';
  }
}

function contentXml(doc: DocIr): string {
  const keys = new Set<string>();
  for (const block of doc.blocks) {
    if (block.kind === "para") for (const run of block.runs) keys.add(runKey(run));
    else if (block.kind === "list")
      for (const item of block.items) for (const run of item) keys.add(runKey(run));
    else if (block.kind === "table")
      for (const row of block.rows)
        for (const cell of row) for (const run of cell) keys.add(runKey(run));
  }
  keys.delete("");

  const spans = [...keys]
    .map((key) => runStyle(key, doc.font.family))
    .join("");

  const first = doc.blocks[0];
  const opener =
    doc.header !== undefined && first !== undefined && first.kind === "para"
      ? '<style:style style:name="P_open" style:family="paragraph" ' +
        'style:parent-style-name="' +
        styleName(first.style) +
        '" style:master-page-name="First_Page"/>'
      : "";

  const body = doc.blocks
    .map((block, index) =>
      index === 0 && opener !== "" && block.kind === "para"
        ? paraXml(
            "P_open",
            block.runs,
            doc.styles[block.style]?.outlineLevel ?? 0,
          )
        : blockXml(block, index, doc),
    )
    .join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    spans +
    opener +
    "</office:automatic-styles>" +
    "<office:body><office:text>" +
    body +
    "</office:text></office:body></office:document-content>"
  );
}

function stylesXml(doc: DocIr): string {
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

  const extra =
    '<style:style style:name="Rule" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:margin-top="6pt" fo:margin-bottom="6pt" ' +
    'fo:border-bottom="0.5pt solid #000000" fo:padding-bottom="2pt"/>' +
    "</style:style>" +
    '<style:style style:name="PageBreak" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:break-before="page"/></style:style>' +
    '<style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard">' +
    '<style:paragraph-properties fo:text-align="end"/>' +
    '<style:text-properties fo:font-size="10pt" fo:font-family="' +
    escAttr(base) +
    '"/></style:style>';

  const lists =
    '<text:list-style style:name="L_bullet">' +
    [1, 2, 3]
      .map(
        (level) =>
          '<text:list-level-style-bullet text:level="' +
          String(level) +
          '" text:bullet-char="\u2022">' +
          '<style:list-level-properties text:space-before="' +
          cm(0.6 * level) +
          '" text:min-label-width="0.6cm"/>' +
          "</text:list-level-style-bullet>",
      )
      .join("") +
    "</text:list-style>" +
    '<text:list-style style:name="L_num">' +
    [1, 2, 3]
      .map(
        (level) =>
          '<text:list-level-style-number text:level="' +
          String(level) +
          '" style:num-suffix="." style:num-format="1">' +
          '<style:list-level-properties text:space-before="' +
          cm(0.6 * level) +
          '" text:min-label-width="0.6cm"/>' +
          "</text:list-level-style-number>",
      )
      .join("") +
    "</text:list-style>";

  const page = doc.page;
  const layout = (name: string): string =>
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
    '<style:header-style><style:header-footer-properties fo:min-height="1cm" ' +
    'fo:margin-bottom="0.5cm"/></style:header-style>' +
    "</style:page-layout-properties></style:page-layout>";

  const headerXml = doc.header
    ? "<style:header><text:p text:style-name=\"Header\">" +
      (doc.header.left === undefined
        ? '<text:chapter text:display="name" text:outline-level="1"/>'
        : esc(doc.header.left)) +
      "<text:tab/>" +
      (doc.header.pageNumberRight === false
        ? ""
        : '<text:page-number text:select-page="current">1</text:page-number>') +
      "</text:p></style:header>"
    : "";

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-styles" +
    NS +
    ' office:version="1.3">' +
    "<office:styles>" +
    '<style:style style:name="Standard" style:family="paragraph">' +
    '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm"/>' +
    '<style:text-properties fo:font-size="' +
    pt(doc.font.sizePt) +
    '" fo:font-family="' +
    escAttr(base) +
    '" fo:language="mn" fo:country="MN"/></style:style>' +
    paragraphs +
    extra +
    lists +
    "</office:styles>" +
    "<office:automatic-styles>" +
    layout("Page_Body") +
    "</office:automatic-styles>" +
    "<office:master-styles>" +
    '<style:master-page style:name="First_Page" style:page-layout-name="Page_Body" ' +
    'style:next-style-name="Standard"/>' +
    '<style:master-page style:name="Standard" style:page-layout-name="Page_Body">' +
    headerXml +
    "</style:master-page>" +
    "</office:master-styles></office:document-styles>"
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
    (doc.title ? "<dc:title>" + esc(doc.title) + "</dc:title>" : "") +
    "<dc:language>mn-MN</dc:language>" +
    "<meta:generator>bichig.dev</meta:generator>" +
    "<meta:creation-date>" +
    new Date().toISOString().slice(0, 19) +
    "</meta:creation-date>" +
    "</office:meta></office:document-meta>"
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
    entry("/", ODF_TEXT) +
    entry("content.xml", "text/xml") +
    entry("styles.xml", "text/xml") +
    entry("meta.xml", "text/xml") +
    "</manifest:manifest>"
  );
}

export function buildOdt(doc: DocIr): Uint8Array<ArrayBuffer> {
  const entries: Record<string, Uint8Array> = {
    mimetype: encoder.encode(ODF_TEXT),
    "META-INF/manifest.xml": encoder.encode(manifestXml()),
    "content.xml": encoder.encode(contentXml(doc)),
    "styles.xml": encoder.encode(stylesXml(doc)),
    "meta.xml": encoder.encode(metaXml(doc)),
  };

  const pkg: OdfPackage = {
    entries,
    order: [
      "META-INF/manifest.xml",
      "content.xml",
      "styles.xml",
      "meta.xml",
    ],
    mimetype: ODF_TEXT,
  };

  return writeOdf(pkg);
}
