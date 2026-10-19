import { odfFont } from "../fonts.ts";
import { ODF_TEXT, manifestXml, writeOdf } from "../odf/index.ts";
import type { OdfPackage } from "../odf/index.ts";
import { STYLE, imageKey, imageSizeCm } from "../docir.ts";
import type {
  DocIr,
  ImageFiles,
  IrBlock,
  IrImage,
  IrRun,
  PageSpec,
} from "../docir.ts";
import { listTree, type ListTree } from "../../markdown.ts";
import { tabFills } from "../flatten.ts";
import { columnWidths, officeMetrics } from "../table.ts";
import { xmlAttr, xmlText } from "../sanitize.ts";
import { NS, cm, runKey, runStyle, styleName } from "./props.ts";
import { TOC_LEVELS, stylesXml } from "./styles.ts";

const encoder = new TextEncoder();

interface Media {
  readonly images: ImageFiles;
  readonly page: PageSpec;
  readonly used: Map<string, string>;
  frames: number;
}

function frameXml(image: IrImage, media: Media): string {
  const key = imageKey(image);
  const file = media.images.get(key);
  if (!file) return "";
  let path = media.used.get(key);
  if (path === undefined) {
    path = "Pictures/image" + String(media.used.size + 1) + "." + file.ext;
    media.used.set(key, path);
  }
  const size = imageSizeCm(image, file, media.page);
  media.frames += 1;
  return (
    '<draw:frame draw:style-name="Fimage" draw:name="Image' +
    String(media.frames) +
    '" text:anchor-type="as-char" svg:width="' +
    cm(size.widthCm) +
    '" svg:height="' +
    cm(size.heightCm) +
    '" draw:z-index="0"><draw:image xlink:href="' +
    path +
    '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' +
    "</draw:frame>"
  );
}

export function verbatimText(text: string): string {
  return xmlText(text)
    .replace(/\t/g, "<text:tab/>")
    .replace(/^ +| {2,}/g, (spaces, at: number) => {
      const lead = at === 0 ? 0 : 1;
      const count = spaces.length - lead;
      return (
        " ".repeat(lead) +
        (count === 1 ? "<text:s/>" : '<text:s text:c="' + count + '"/>')
      );
    });
}

function runsXml(
  runs: readonly IrRun[],
  media: Media,
  verbatim = false,
): string {
  let out = "";
  runs.forEach((run, index) => {
    if (verbatim && index > 0) out += "<text:line-break/>";
    if (run.tab) {
      out += "<text:tab/>";
      return;
    }
    if (run.image) {
      out += frameXml(run.image, media);
      return;
    }
    if (!run.text) return;
    const key = runKey(run);
    const text = (
      verbatim ? verbatimText(run.text) : xmlText(run.text)
    ).replace(/\n/g, "<text:line-break/>");
    const body =
      key === ""
        ? text
        : '<text:span text:style-name="T_' + key + '">' + text + "</text:span>";
    out += run.href
      ? '<text:a xlink:type="simple" xlink:href="' +
        xmlAttr(run.href) +
        '">' +
        body +
        "</text:a>"
      : body;
  });
  return out;
}

function paraXml(
  style: string,
  runs: readonly IrRun[],
  level: number,
  media: Media,
): string {
  const inner = runsXml(runs, media, style === STYLE.code);
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
  media: Media,
): string {
  switch (block.kind) {
    case "para":
      return paraXml(
        block.style,
        block.runs,
        doc.styles[block.style]?.outlineLevel ?? 0,
        media,
      );

    case "list": {
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
                  '">' +
                  runsXml(tabFills(row[i] ?? []), media) +
                  "</text:p></table:table-cell>"
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
                runsXml(row[i] ?? [], media) +
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
  const entries = doc.blocks
    .map((block) => {
      if (block.kind !== "para") return "";
      const level = doc.styles[block.style]?.outlineLevel ?? 0;
      if (level < 1 || level > 3) return "";
      return (
        '<text:p text:style-name="TOC_' +
        String(level) +
        '">' +
        xmlText(
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

function blockRuns(block: IrBlock): readonly IrRun[] {
  if (block.kind === "para") return block.runs;
  if (block.kind === "list") return block.items.flat();
  if (block.kind === "table") return block.rows.flat(2);
  return [];
}

function contentXml(doc: DocIr, options: OdtOptions, media: Media): string {
  const keys = new Set(doc.blocks.flatMap(blockRuns).map(runKey));
  keys.delete("");

  const spans = [...keys].map((key) => runStyle(key, doc.font.family)).join("");

  const auto = new Set<string>();
  const parts = doc.blocks.map((block, index) =>
    blockXml(block, index, doc, auto, media),
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
    (media.frames
      ? '<style:style style:name="Fimage" style:family="graphic">' +
        '<style:graphic-properties style:vertical-pos="top" ' +
        'style:vertical-rel="baseline" fo:border="none" fo:padding="0cm"/>' +
        "</style:style>"
      : "") +
    spans +
    (auto.delete("cells") ? cellStyles() : "") +
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
