import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import {
  STYLE,
  TOC_TITLE,
  imageKey,
  imageSizeCm,
  isTocLevel,
  outlineLevel,
  runsText,
  tocEntries,
  withToc,
} from "../docir.ts";
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
import { xmlAttr } from "../sanitize.ts";
import { REL, XML_HEAD, relsXml, type Rel } from "../ooxml.ts";
import {
  JC,
  LIST_LEVELS,
  MONO,
  NS_W,
  numberingXml,
  stylesXml,
  styleId,
  twips,
  type NumDef,
} from "./styles.ts";

import { NS_R, coreXml, footerXml, paraXml, settingsXml } from "./parts.ts";

export interface DocxOptions {
  readonly toc?: boolean;
  readonly images?: ImageFiles;
}

const encoder = new TextEncoder();

const EMU_CM = 360000;

const NS_WP =
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PICTURE = "http://schemas.openxmlformats.org/drawingml/2006/picture";

const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.";

interface Body {
  readonly links: Rel[];
  readonly nums: NumDef[];
  bookmark: number;
  drawing: number;
  readonly page: PageSpec;
  readonly images: ImageFiles;
  readonly media: Map<string, { readonly id: string; readonly name: string }>;
}

function drawingXml(image: IrImage, body: Body): string {
  const key = imageKey(image);
  const file = body.images.get(key);
  if (!file) return "";
  let media = body.media.get(key);
  if (!media) {
    media = {
      id: "rId" + String(body.links.length + 10),
      name: "image" + String(body.media.size + 1) + "." + file.ext,
    };
    body.links.push({
      id: media.id,
      type: REL + "/image",
      target: "media/" + media.name,
    });
    body.media.set(key, media);
  }
  const size = imageSizeCm(image, file, body.page);
  const extent =
    'cx="' +
    String(Math.round(size.widthCm * EMU_CM)) +
    '" cy="' +
    String(Math.round(size.heightCm * EMU_CM)) +
    '"';
  body.drawing += 1;
  const id = String(body.drawing);
  return (
    '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    "<wp:extent " +
    extent +
    '/><wp:docPr id="' +
    id +
    '" name="Picture ' +
    id +
    '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="' +
    DRAWING +
    '" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="' +
    DRAWING +
    '"><a:graphicData uri="' +
    PICTURE +
    '"><pic:pic xmlns:pic="' +
    PICTURE +
    '"><pic:nvPicPr><pic:cNvPr id="0" name="' +
    media.name +
    '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' +
    media.id +
    '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext ' +
    extent +
    '/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
  );
}

function textRun(text: string, rPr: string): string {
  return (
    "<w:r>" +
    (rPr ? "<w:rPr>" + rPr + "</w:rPr>" : "") +
    '<w:t xml:space="preserve">' +
    xmlAttr(text) +
    "</w:t></w:r>"
  );
}

function runsXml(
  runs: readonly IrRun[],
  body: Body,
  lineBreaks: boolean,
): string {
  let out = "";
  runs.forEach((run, index) => {
    if (lineBreaks && index > 0) out += "<w:r><w:br/></w:r>";
    if (run.tab) {
      out += "<w:r><w:tab/></w:r>";
      return;
    }
    if (run.image) {
      out += drawingXml(run.image, body);
      return;
    }
    if (!run.text) return;
    let rPr = run.href ? '<w:rStyle w:val="Hyperlink"/>' : "";
    if (run.mono)
      rPr +=
        '<w:rFonts w:ascii="' +
        MONO +
        '" w:hAnsi="' +
        MONO +
        '" w:cs="' +
        MONO +
        '"/>';
    if (run.bold) rPr += "<w:b/><w:bCs/>";
    if (run.italic) rPr += "<w:i/><w:iCs/>";
    if (run.strike) rPr += "<w:strike/>";
    const text = run.text
      .split("\n")
      .map((part) => textRun(part, rPr))
      .join("<w:r><w:br/></w:r>");
    if (run.href) {
      const id = "rId" + String(body.links.length + 10);
      body.links.push({
        id,
        type: REL + "/hyperlink",
        target: run.href,
        external: true,
      });
      out +=
        '<w:hyperlink r:id="' +
        id +
        '" w:history="1">' +
        text +
        "</w:hyperlink>";
    } else out += text;
  });
  return out;
}

function styled(style: string, extra = ""): string {
  return '<w:pStyle w:val="' + styleId(style) + '"/>' + extra;
}

function headingBookmark(level: number, body: Body, inner: string): string {
  if (!isTocLevel(level)) return inner;
  const id = body.bookmark++;
  const name = "_Toc" + String(100000 + id);
  return (
    '<w:bookmarkStart w:id="' +
    String(id) +
    '" w:name="' +
    name +
    '"/>' +
    inner +
    '<w:bookmarkEnd w:id="' +
    String(id) +
    '"/>'
  );
}

function listXml(
  block: Extract<IrBlock, { kind: "list" }>,
  body: Body,
): string {
  const render = (tree: ListTree<readonly IrRun[]>, level: number): string => {
    body.nums.push({ ordered: tree.ordered, start: tree.start, level });
    const numPr =
      '<w:numPr><w:ilvl w:val="' +
      String(level) +
      '"/><w:numId w:val="' +
      String(body.nums.length) +
      '"/></w:numPr>';
    return tree.entries
      .map(
        ({ item, sub }) =>
          paraXml(styled(block.style, numPr), runsXml(item, body, false)) +
          (sub ? render(sub, Math.min(level + 1, LIST_LEVELS - 1)) : ""),
      )
      .join("");
  };
  return render(listTree(block), 0);
}

const rule = (side: string, size: number): string =>
  "<w:" +
  side +
  ' w:val="single" w:sz="' +
  String(size) +
  '" w:space="0" w:color="000000"/>';

function cellXml(
  block: Extract<IrBlock, { kind: "table" }>,
  runs: readonly IrRun[],
  width: number,
  align: (typeof block.align)[number],
  head: boolean,
  body: Body,
): string {
  const fill = runs.some((run) => run.fill);
  return (
    '<w:tc><w:tcPr><w:tcW w:w="' +
    String(width) +
    '" w:type="dxa"/>' +
    (head ? "<w:tcBorders>" + rule("bottom", 6) + "</w:tcBorders>" : "") +
    (head ? '<w:vAlign w:val="center"/>' : "") +
    "</w:tcPr>" +
    paraXml(
      styled(
        head ? STYLE.tableHead : (block.cellStyle ?? STYLE.tableCell),
        fill
          ? '<w:tabs><w:tab w:val="right" w:leader="underscore" w:pos="' +
              String(Math.max(0, width - 216)) +
              '"/></w:tabs>'
          : align
            ? '<w:jc w:val="' + JC[align] + '"/>'
            : "",
      ),
      runsXml(tabFills(runs), body, false),
    ) +
    "</w:tc>"
  );
}

function tableXml(
  block: Extract<IrBlock, { kind: "table" }>,
  doc: DocIr,
  body: Body,
): string {
  const header = block.header !== false;
  const widths = columnWidths(
    block.rows,
    header,
    doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm,
    officeMetrics(
      doc.styles[block.cellStyle ?? STYLE.tableCell]?.sizePt ?? doc.font.sizePt,
    ),
  ).map(twips);
  const rows = block.rows
    .map((row, rowIndex) => {
      const head = header && rowIndex === 0;
      const cells = widths
        .map((width, i) =>
          cellXml(block, row[i] ?? [], width, block.align[i], head, body),
        )
        .join("");
      return (
        "<w:tr>" +
        (head ? "<w:trPr><w:tblHeader/></w:trPr>" : "") +
        cells +
        "</w:tr>"
      );
    })
    .join("");
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="' +
    String(widths.reduce((sum, width) => sum + width, 0)) +
    '" w:type="dxa"/><w:jc w:val="' +
    JC[block.placement ?? "center"] +
    '"/>' +
    (header
      ? "<w:tblBorders>" +
        rule("top", 12) +
        rule("bottom", 12) +
        "</w:tblBorders>"
      : "") +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="28" w:type="dxa"/><w:left w:w="57" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' +
    widths.map((width) => '<w:gridCol w:w="' + String(width) + '"/>').join("") +
    "</w:tblGrid>" +
    rows +
    "</w:tbl>"
  );
}

function blockXml(block: IrBlock, doc: DocIr, body: Body): string {
  switch (block.kind) {
    case "para": {
      const inner = runsXml(block.runs, body, block.style === STYLE.code);
      return paraXml(
        styled(block.style),
        headingBookmark(outlineLevel(doc, block.style), body, inner),
      );
    }
    case "list":
      return listXml(block, body);
    case "table":
      return tableXml(block, doc, body);
    case "rule":
      return paraXml(
        '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>' +
          '<w:spacing w:before="120" w:after="120"/>',
        "",
      );
    case "break":
      return paraXml("", '<w:r><w:br w:type="page"/></w:r>');
  }
}

function tocXml(doc: DocIr): string {
  const entries = tocEntries(doc).map(({ level, runs }, bookmark) =>
    paraXml(
      '<w:pStyle w:val="TOC' + String(level) + '"/>',
      '<w:hyperlink w:anchor="_Toc' +
        String(100000 + bookmark) +
        '" w:history="1">' +
        textRun(runsText(runs), "") +
        "</w:hyperlink>",
    ),
  );
  const begin =
    '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  if (!entries.length) entries.push(paraXml("", ""));
  const first = entries[0]!.replace(
    /^<w:p>(<w:pPr>.*?<\/w:pPr>)?/,
    (m) => m + begin,
  );
  const last = entries.length - 1;
  entries[0] = first;
  entries[last] = entries[last]!.replace(/<\/w:p>$/, end + "</w:p>");
  return (
    paraXml('<w:pStyle w:val="TOCHeading"/>', textRun(TOC_TITLE, "")) +
    entries.join("") +
    paraXml("", '<w:r><w:br w:type="page"/></w:r>')
  );
}

function documentXml(doc: DocIr, options: DocxOptions, body: Body): string {
  const blocks = doc.blocks.map((block) => blockXml(block, doc, body));
  if (options.toc) withToc(doc, blocks, tocXml(doc));
  const page = doc.page;
  const top = twips(page.marginTopCm);
  const sect =
    "<w:sectPr>" +
    (doc.pageNumbers
      ? '<w:footerReference w:type="default" r:id="rId4"/>'
      : "") +
    '<w:pgSz w:w="' +
    String(twips(page.widthCm)) +
    '" w:h="' +
    String(twips(page.heightCm)) +
    '"/><w:pgMar w:top="' +
    String(top) +
    '" w:right="' +
    String(twips(page.marginOuterCm)) +
    '" w:bottom="' +
    String(twips(page.marginBottomCm)) +
    '" w:left="' +
    String(twips(page.marginInnerCm)) +
    '" w:header="' +
    String(Math.max(360, top - 567)) +
    '" w:footer="567" w:gutter="0"/>' +
    "</w:sectPr>";
  return (
    XML_HEAD +
    "<w:document " +
    NS_W +
    " " +
    NS_R +
    " " +
    NS_WP +
    "><w:body>" +
    blocks.join("") +
    sect +
    "</w:body></w:document>"
  );
}

export function buildDocx(
  doc: DocIr,
  options: DocxOptions = {},
): Uint8Array<ArrayBuffer> {
  const body: Body = {
    links: [],
    nums: [],
    bookmark: 0,
    drawing: 0,
    page: doc.page,
    images: options.images ?? new Map(),
    media: new Map(),
  };
  const document = documentXml(doc, options, body);

  const overrides = [
    ["/word/document.xml", CT + "document.main+xml"],
    ["/word/styles.xml", CT + "styles+xml"],
    ["/word/settings.xml", CT + "settings+xml"],
    ["/word/numbering.xml", CT + "numbering+xml"],
    [
      "/docProps/core.xml",
      "application/vnd.openxmlformats-package.core-properties+xml",
    ],
  ];
  if (doc.pageNumbers) overrides.push(["/word/footer1.xml", CT + "footer+xml"]);

  const files: Record<string, string> = {
    "[Content_Types].xml":
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      [...new Set([...body.media.values()].map((m) => m.name.split(".")[1]))]
        .map(
          (ext) =>
            '<Default Extension="' +
            ext +
            '" ContentType="image/' +
            ext +
            '"/>',
        )
        .join("") +
      overrides
        .map(
          ([part, type]) =>
            '<Override PartName="' + part + '" ContentType="' + type + '"/>',
        )
        .join("") +
      "</Types>",
    "_rels/.rels": relsXml([
      {
        id: "rId1",
        type: REL + "/officeDocument",
        target: "word/document.xml",
      },
      {
        id: "rId2",
        type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
        target: "docProps/core.xml",
      },
    ]),
    "word/document.xml": document,
    "word/_rels/document.xml.rels": relsXml([
      { id: "rId1", type: REL + "/styles", target: "styles.xml" },
      { id: "rId2", type: REL + "/settings", target: "settings.xml" },
      { id: "rId3", type: REL + "/numbering", target: "numbering.xml" },
      ...(doc.pageNumbers
        ? [{ id: "rId4", type: REL + "/footer", target: "footer1.xml" }]
        : []),
      ...body.links,
    ]),
    "word/styles.xml": stylesXml(doc),
    "word/settings.xml": settingsXml(doc, options.toc ?? false),
    "word/numbering.xml": numberingXml(body.nums),
    "docProps/core.xml": coreXml(doc),
  };
  if (doc.pageNumbers) files["word/footer1.xml"] = footerXml();

  const zippable: Zippable = {};
  for (const [name, xml] of Object.entries(files))
    zippable[name] = encoder.encode(xml);
  for (const [key, media] of body.media)
    zippable["word/media/" + media.name] = body.images.get(key)!.bytes;
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
