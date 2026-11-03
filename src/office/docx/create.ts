import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import {
  TOC_TITLE,
  isTocLevel,
  outlineLevel,
  runsText,
  tocEntries,
  withToc,
} from "../docir.ts";
import type { DocIr, ImageFiles, IrBlock, IrRun } from "../docir.ts";
import { listTree, type ListTree } from "../../markdown.ts";
import { REL, XML_HEAD, relsXml } from "../ooxml.ts";
import { LIST_LEVELS, NS_W, numberingXml, stylesXml, twips } from "./styles.ts";
import { NS_R, coreXml, footerXml, paraXml, settingsXml } from "./parts.ts";
import { type Body, runsXml, textRun } from "./createruns.ts";
import { styled, tableXml } from "./createtable.ts";

export interface DocxOptions {
  readonly toc?: boolean;
  readonly images?: ImageFiles;
}

const encoder = new TextEncoder();

const NS_WP =
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.";

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

function blockXml(block: IrBlock, doc: DocIr, body: Body): string {
  switch (block.kind) {
    case "para": {
      const inner = runsXml(block.runs, body, block.verbatim === true);
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
