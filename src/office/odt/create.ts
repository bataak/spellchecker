import { odfFont } from "../fonts.ts";
import { ODF_TEXT, writeOdf } from "../odf/index.ts";
import type { OdfPackage } from "../odf/index.ts";
import { STYLE } from "../docir.ts";
import type { DocIr, IrBlock, IrRun, ParaStyle } from "../docir.ts";
import { columnWidths, officeMetrics } from "../table.ts";

const encoder = new TextEncoder();

const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
  ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
  ' xmlns:xlink="http://www.w3.org/1999/xlink"';

const MONO = odfFont("Courier New");

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
  if (style.borderBottom)
    parts.push(
      'fo:border-bottom="0.5pt solid #000000"',
      'fo:padding-bottom="2pt"',
    );
  parts.push('fo:orphans="2"', 'fo:widows="2"');

  return "<style:paragraph-properties " + parts.join(" ") + "/>";
}

function textProps(style: ParaStyle, base: string): string {
  const parts: string[] = [];
  if (style.sizePt !== undefined)
    parts.push('fo:font-size="' + pt(style.sizePt) + '"');
  if (style.bold) parts.push('fo:font-weight="bold"');
  if (style.italic) parts.push('fo:font-style="italic"');
  if (style.mono) parts.push('fo:font-family="&apos;' + MONO + '&apos;"');
  else parts.push('fo:font-family="' + escAttr(base) + '"');
  if (style.noHyphenation) parts.push('fo:hyphenate="false"');
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
  if (key.includes("s")) parts.push('style:text-line-through-style="solid"');
  if (key.includes("m"))
    parts.push('fo:font-family="&apos;' + MONO + '&apos;"');
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
    if (run.tab) {
      out += "<text:tab/>";
      continue;
    }
    if (!run.text) continue;
    const key = runKey(run);
    const text = esc(run.text).replace(/\n/g, "<text:line-break/>");
    const body =
      key === ""
        ? text
        : '<text:span text:style-name="T_' + key + '">' + text + "</text:span>";
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
  const inner = runsXml(runs);
  if (level > 0)
    return (
      '<text:h text:style-name="' +
      styleName(style) +
      '" text:outline-level="' +
      String(level) +
      '">' +
      inner +
      "</text:h>"
    );
  return (
    '<text:p text:style-name="' + styleName(style) + '">' + inner + "</text:p>"
  );
}

const ODT_ALIGN: Readonly<Record<string, string>> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

const TABLE_ALIGN: Readonly<Record<string, string>> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "center",
};

const CELL_BORDERS: Readonly<Record<string, string>> = {
  C_plain: "",
  C_head:
    'fo:border-top="1pt solid #000000" fo:border-bottom="0.5pt solid #000000" ',
  C_only:
    'fo:border-top="1pt solid #000000" fo:border-bottom="1pt solid #000000" ',
  C_last: 'fo:border-bottom="1pt solid #000000" ',
};

function cellStyles(): string {
  return Object.entries(CELL_BORDERS)
    .map(
      ([name, borders]) =>
        '<style:style style:name="' +
        name +
        '" style:family="table-cell"><style:table-cell-properties ' +
        borders +
        'fo:padding-top="0.05cm" fo:padding-bottom="0.05cm" ' +
        'fo:padding-left="0.1cm" fo:padding-right="0.1cm" ' +
        'style:vertical-align="' +
        (name === "C_head" || name === "C_only" ? "middle" : "top") +
        '"/></style:style>',
    )
    .join("");
}

function blockXml(
  block: IrBlock,
  index: number,
  doc: DocIr,
  auto: Set<string>,
): string {
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
      return (
        '<text:list text:style-name="' + name + '">' + items + "</text:list>"
      );
    }

    case "table": {
      const header = block.header !== false;
      const name = "Table" + String(index + 1);
      const widths = columnWidths(
        block.rows,
        header,
        doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm,
        officeMetrics(
          doc.styles[block.cellStyle ?? STYLE.tableCell]?.sizePt ??
            doc.font.sizePt,
        ),
      );
      auto.add("cells");
      auto.add(
        '<style:style style:name="' +
          name +
          '" style:family="table"><style:table-properties style:width="' +
          cm(widths.reduce((sum, width) => sum + width, 0)) +
          '" table:align="' +
          TABLE_ALIGN[block.placement ?? "center"] +
          '"/></style:style>' +
          widths
            .map(
              (width, i) =>
                '<style:style style:name="' +
                name +
                ".C" +
                String(i + 1) +
                '" style:family="table-column"><style:table-column-properties style:column-width="' +
                cm(width) +
                '"/></style:style>',
            )
            .join(""),
      );
      const last = block.rows.length - 1;
      const rows = block.rows
        .map((row, rowIndex) => {
          const head = header && rowIndex === 0;
          const plainStyle = !header
            ? "C_plain"
            : head
              ? rowIndex === last
                ? "C_only"
                : "C_head"
              : rowIndex === last
                ? "C_last"
                : "C_plain";
          const cells = widths
            .map((_, i) => {
              const fill = (row[i] ?? []).some((run) => run.fill);
              const cellStyle = plainStyle;
              const base = head
                ? "TableHead"
                : (block.cellStyle ?? "TableCell");
              const align = block.align[i];
              if (fill) {
                const tab = Math.max(0, widths[i]! - 0.2);
                const para = base + "_fill_" + String(Math.round(tab * 100));
                auto.add(
                  '<style:style style:name="' +
                    para +
                    '" style:family="paragraph" style:parent-style-name="' +
                    base +
                    '"><style:paragraph-properties><style:tab-stops>' +
                    '<style:tab-stop style:position="' +
                    cm(tab) +
                    '" style:type="right" style:leader-style="solid" ' +
                    'style:leader-type="single" style:leader-width="0.5pt"/>' +
                    "</style:tab-stops></style:paragraph-properties></style:style>",
                );
                return (
                  '<table:table-cell table:style-name="' +
                  cellStyle +
                  '" office:value-type="string"><text:p text:style-name="' +
                  para +
                  '"><text:tab/></text:p></table:table-cell>'
                );
              }
              const para = align ? base + "_" + ODT_ALIGN[align] : base;
              if (align)
                auto.add(
                  '<style:style style:name="' +
                    para +
                    '" style:family="paragraph" style:parent-style-name="' +
                    base +
                    '"><style:paragraph-properties fo:text-align="' +
                    ODT_ALIGN[align] +
                    '"/></style:style>',
                );
              return (
                '<table:table-cell table:style-name="' +
                cellStyle +
                '" office:value-type="string"><text:p text:style-name="' +
                para +
                '">' +
                runsXml(row[i] ?? []) +
                "</text:p></table:table-cell>"
              );
            })
            .join("");
          return "<table:table-row>" + cells + "</table:table-row>";
        })
        .join("");
      return (
        '<table:table table:name="' +
        name +
        '" table:style-name="' +
        name +
        '">' +
        widths
          .map(
            (_, i) =>
              '<table:table-column table:style-name="' +
              name +
              ".C" +
              String(i + 1) +
              '"/>',
          )
          .join("") +
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

export interface OdtOptions {
  readonly toc?: boolean;
}

const TOC_LEVELS = [1, 2, 3] as const;

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
  const entries = doc.blocks
    .map((block) => {
      if (block.kind !== "para") return "";
      const level = doc.styles[block.style]?.outlineLevel ?? 0;
      if (level < 1 || level > 3) return "";
      return (
        '<text:p text:style-name="TOC_' +
        String(level) +
        '">' +
        esc(
          block.runs
            .map((run) => run.text)
            .join("")
            .replace(/\s*\n\s*/g, " "),
        ) +
        "<text:tab/></text:p>"
      );
    })
    .join("");
  return (
    '<text:table-of-content text:protected="true" text:name="TOC">' +
    '<text:table-of-content-source text:outline-level="3">' +
    '<text:index-title-template text:style-name="TOC_Heading">Гарчиг' +
    "</text:index-title-template>" +
    templates +
    "</text:table-of-content-source><text:index-body>" +
    '<text:index-title text:name="TOC_Head">' +
    '<text:p text:style-name="TOC_Heading">Гарчиг</text:p>' +
    "</text:index-title>" +
    entries +
    "</text:index-body></text:table-of-content>" +
    '<text:p text:style-name="PageBreak"/>'
  );
}

function contentXml(doc: DocIr, options: OdtOptions): string {
  const keys = new Set<string>();
  for (const block of doc.blocks) {
    if (block.kind === "para")
      for (const run of block.runs) keys.add(runKey(run));
    else if (block.kind === "list")
      for (const item of block.items)
        for (const run of item) keys.add(runKey(run));
    else if (block.kind === "table")
      for (const row of block.rows)
        for (const cell of row) for (const run of cell) keys.add(runKey(run));
  }
  keys.delete("");

  const spans = [...keys].map((key) => runStyle(key, doc.font.family)).join("");

  const auto = new Set<string>();
  const parts = doc.blocks.map((block, index) =>
    blockXml(block, index, doc, auto),
  );
  if (options.toc) {
    const first = doc.blocks[0];
    const titleFirst =
      first !== undefined &&
      first.kind === "para" &&
      (first.style === STYLE.title ||
        doc.styles[first.style]?.outlineLevel === 1);
    parts.splice(titleFirst ? 1 : 0, 0, tocXml(doc));
  }
  const body = parts.join("");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<office:document-content" +
    NS +
    ' office:version="1.3">' +
    "<office:automatic-styles>" +
    spans +
    (auto.delete("cells") ? cellStyles() : "") +
    [...auto].join("") +
    "</office:automatic-styles>" +
    "<office:body><office:text>" +
    body +
    "</office:text></office:body></office:document-content>"
  );
}

function tocWidth(doc: DocIr): number {
  return doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm;
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
    '<style:footer-style><style:header-footer-properties fo:min-height="0.6cm" ' +
    'fo:margin-top="0.4cm"/></style:footer-style>' +
    "</style:page-layout-properties></style:page-layout>";

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
    escAttr(base) +
    '" fo:language="mn" fo:country="MN" fo:hyphenate="true" ' +
    'fo:hyphenation-remain-char-count="3" ' +
    'fo:hyphenation-push-char-count="3"/></style:style>' +
    paragraphs +
    extra +
    lists +
    "</office:styles>" +
    "<office:automatic-styles>" +
    layout("Page_Body") +
    "</office:automatic-styles>" +
    "<office:master-styles>" +
    '<style:master-page style:name="Standard" style:page-layout-name="Page_Body">' +
    footerXml +
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

export function buildOdt(
  doc: DocIr,
  options: OdtOptions = {},
): Uint8Array<ArrayBuffer> {
  doc = { ...doc, font: { ...doc.font, family: odfFont(doc.font.family) } };
  const entries: Record<string, Uint8Array> = {
    mimetype: encoder.encode(ODF_TEXT),
    "META-INF/manifest.xml": encoder.encode(manifestXml()),
    "content.xml": encoder.encode(contentXml(doc, options)),
    "styles.xml": encoder.encode(stylesXml(doc)),
    "meta.xml": encoder.encode(metaXml(doc)),
  };

  const pkg: OdfPackage = {
    entries,
    order: ["META-INF/manifest.xml", "content.xml", "styles.xml", "meta.xml"],
    mimetype: ODF_TEXT,
  };

  return writeOdf(pkg);
}
