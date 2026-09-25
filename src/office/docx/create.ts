import { zipSync } from "fflate";
import type { Zippable } from "fflate";
import { STYLE } from "../docir.ts";
import type { Align, DocIr, IrBlock, IrRun, ParaStyle } from "../docir.ts";

export interface DocxOptions {
  readonly toc?: boolean;
}

const encoder = new TextEncoder();

const MONO = "Courier New";
const TWIP_CM = 567;

const NS_W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS_R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.";

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twips(cm: number): number {
  return Math.round(cm * TWIP_CM);
}

interface Rel {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
}

function relsXml(rels: readonly Rel[]): string {
  return (
    XML_HEAD +
    '<Relationships xmlns="' +
    REL_PKG +
    '">' +
    rels
      .map(
        (rel) =>
          '<Relationship Id="' +
          rel.id +
          '" Type="' +
          rel.type +
          '" Target="' +
          esc(rel.target) +
          '"' +
          (rel.external ? ' TargetMode="External"' : "") +
          "/>",
      )
      .join("") +
    "</Relationships>"
  );
}

const JC: Record<Align, string> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "both",
};

function styleId(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

function pPrInner(style: ParaStyle): string {
  let out = "";
  if (style.keepWithNext) out += "<w:keepNext/>";
  if (style.breakBefore) out += "<w:pageBreakBefore/>";
  if (style.borderBottom)
    out +=
      '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>';
  if (style.leaderTabCm !== undefined)
    out +=
      '<w:tabs><w:tab w:val="' +
      (style.rightTab ? "right" : "left") +
      '" w:leader="underscore" w:pos="' +
      String(twips(style.leaderTabCm)) +
      '"/></w:tabs>';
  const spacing: string[] = [];
  if (style.spaceBeforePt !== undefined)
    spacing.push(
      'w:before="' + String(Math.round(style.spaceBeforePt * 20)) + '"',
    );
  if (style.spaceAfterPt !== undefined)
    spacing.push(
      'w:after="' + String(Math.round(style.spaceAfterPt * 20)) + '"',
    );
  if (style.lineHeightPercent !== undefined)
    spacing.push(
      'w:line="' +
        String(Math.round((style.lineHeightPercent * 240) / 100)) +
        '" w:lineRule="auto"',
    );
  if (spacing.length) out += "<w:spacing " + spacing.join(" ") + "/>";
  const ind: string[] = [];
  if (style.marginLeftCm !== undefined)
    ind.push('w:left="' + String(twips(style.marginLeftCm)) + '"');
  if (style.marginRightCm !== undefined)
    ind.push('w:right="' + String(twips(style.marginRightCm)) + '"');
  if (style.firstLineIndentCm !== undefined)
    ind.push('w:firstLine="' + String(twips(style.firstLineIndentCm)) + '"');
  if (ind.length) out += "<w:ind " + ind.join(" ") + "/>";
  if (style.align) out += '<w:jc w:val="' + JC[style.align] + '"/>';
  if (style.outlineLevel !== undefined)
    out += '<w:outlineLvl w:val="' + String(style.outlineLevel - 1) + '"/>';
  return out;
}

function rPrInner(style: ParaStyle): string {
  let out = "";
  if (style.mono)
    out +=
      '<w:rFonts w:ascii="' +
      MONO +
      '" w:hAnsi="' +
      MONO +
      '" w:cs="' +
      MONO +
      '"/>';
  if (style.bold) out += "<w:b/><w:bCs/>";
  if (style.italic) out += "<w:i/><w:iCs/>";
  if (style.sizePt !== undefined) {
    const half = String(Math.round(style.sizePt * 2));
    out += '<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>';
  }
  return out;
}

function styleXml(name: string, style: ParaStyle): string {
  const heading = /^Heading([1-6])$/.exec(name);
  const pPr = pPrInner(style);
  const rPr = rPrInner(style);
  return (
    '<w:style w:type="paragraph" w:customStyle="' +
    (heading ? "0" : "1") +
    '" w:styleId="' +
    styleId(name) +
    '"><w:name w:val="' +
    (heading ? "heading " + heading[1] : esc(name)) +
    '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    (heading ? '<w:uiPriority w:val="9"/>' : "") +
    "<w:qFormat/>" +
    (pPr ? "<w:pPr>" + pPr + "</w:pPr>" : "") +
    (rPr ? "<w:rPr>" + rPr + "</w:rPr>" : "") +
    "</w:style>"
  );
}

function stylesXml(doc: DocIr): string {
  const font = esc(doc.font.family);
  const half = String(Math.round(doc.font.sizePt * 2));
  return (
    XML_HEAD +
    "<w:styles " +
    NS_W +
    ">" +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="' +
    font +
    '" w:hAnsi="' +
    font +
    '" w:eastAsia="' +
    font +
    '" w:cs="' +
    font +
    '"/>' +
    '<w:sz w:val="' +
    half +
    '"/><w:szCs w:val="' +
    half +
    '"/>' +
    '<w:lang w:val="mn-MN" w:eastAsia="mn-MN" w:bidi="ar-SA"/>' +
    "</w:rPr></w:rPrDefault>" +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
    "</w:docDefaults>" +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    Object.entries(doc.styles)
      .map(([name, style]) => styleXml(name, style))
      .join("") +
    '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    [1, 2, 3]
      .map(
        (level) =>
          '<w:style w:type="paragraph" w:styleId="TOC' +
          String(level) +
          '"><w:name w:val="toc ' +
          String(level) +
          '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/>' +
          '<w:pPr><w:spacing w:after="100"/><w:ind w:left="' +
          String((level - 1) * 240) +
          '"/></w:pPr></w:style>',
      )
      .join("") +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
    '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
    '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar>' +
    '<w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
    '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>' +
    "</w:tblCellMar></w:tblPr></w:style>" +
    "</w:styles>"
  );
}

const NUMBERING_BULLET = 1;
const NUMBERING_DECIMAL = 2;

function abstractNum(id: number, ordered: boolean): string {
  return (
    '<w:abstractNum w:abstractNumId="' +
    String(id) +
    '"><w:multiLevelType w:val="singleLevel"/>' +
    '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' +
    (ordered ? "decimal" : "bullet") +
    '"/><w:lvlText w:val="' +
    (ordered ? "%1." : "•") +
    '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' +
    "</w:lvl></w:abstractNum>"
  );
}

function numberingXml(
  nums: readonly { ordered: boolean; start: number }[],
): string {
  return (
    XML_HEAD +
    "<w:numbering " +
    NS_W +
    ">" +
    abstractNum(NUMBERING_BULLET, false) +
    abstractNum(NUMBERING_DECIMAL, true) +
    nums
      .map(
        (num, i) =>
          '<w:num w:numId="' +
          String(i + 1) +
          '"><w:abstractNumId w:val="' +
          String(num.ordered ? NUMBERING_DECIMAL : NUMBERING_BULLET) +
          '"/>' +
          (num.ordered
            ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="' +
              String(num.start) +
              '"/></w:lvlOverride>'
            : "") +
          "</w:num>",
      )
      .join("") +
    "</w:numbering>"
  );
}

interface Body {
  readonly links: Rel[];
  readonly nums: { ordered: boolean; start: number }[];
  bookmark: number;
}

function textRun(text: string, rPr: string): string {
  return (
    "<w:r>" +
    (rPr ? "<w:rPr>" + rPr + "</w:rPr>" : "") +
    '<w:t xml:space="preserve">' +
    esc(text) +
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

function paraXml(pPr: string, inner: string): string {
  return "<w:p>" + (pPr ? "<w:pPr>" + pPr + "</w:pPr>" : "") + inner + "</w:p>";
}

function styled(style: string, extra = ""): string {
  return '<w:pStyle w:val="' + styleId(style) + '"/>' + extra;
}

function plainText(runs: readonly IrRun[]): string {
  return runs.map((run) => run.text).join("");
}

function headingBookmark(level: number, body: Body, inner: string): string {
  if (level < 1 || level > 3) return inner;
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

function blockXml(block: IrBlock, doc: DocIr, body: Body): string {
  switch (block.kind) {
    case "para": {
      const style = doc.styles[block.style];
      const leader =
        style?.leaderTabCm !== undefined && block.runs.length === 0;
      const inner = leader
        ? "<w:r><w:tab/></w:r>"
        : runsXml(block.runs, body, block.style === STYLE.code);
      return paraXml(
        styled(block.style),
        headingBookmark(style?.outlineLevel ?? 0, body, inner),
      );
    }
    case "list": {
      body.nums.push({ ordered: block.ordered, start: block.start });
      const numId = String(body.nums.length);
      return block.items
        .map((item) =>
          paraXml(
            styled(
              block.style,
              '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' +
                numId +
                '"/></w:numPr>',
            ),
            runsXml(item, body, false),
          ),
        )
        .join("");
    }
    case "table": {
      const width = Math.max(...block.rows.map((r) => r.length), 1);
      const text = twips(
        doc.page.widthCm - doc.page.marginInnerCm - doc.page.marginOuterCm,
      );
      const col = Math.floor(text / width);
      const border = (side: string): string =>
        "<w:" +
        side +
        ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
      const rows = block.rows
        .map((row, rowIndex) => {
          const cells = Array.from({ length: width }, (_, i) => {
            const align = block.align[i];
            const style = rowIndex === 0 ? STYLE.tableHead : STYLE.tableCell;
            return (
              '<w:tc><w:tcPr><w:tcW w:w="' +
              String(col) +
              '" w:type="dxa"/></w:tcPr>' +
              paraXml(
                styled(
                  style,
                  align && rowIndex > 0
                    ? '<w:jc w:val="' + JC[align] + '"/>'
                    : "",
                ),
                runsXml(row[i] ?? [], body, false),
              ) +
              "</w:tc>"
            );
          }).join("");
          return (
            "<w:tr>" +
            (rowIndex === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : "") +
            cells +
            "</w:tr>"
          );
        })
        .join("");
      return (
        '<w:tbl><w:tblPr><w:tblW w:w="' +
        String(col * width) +
        '" w:type="dxa"/><w:tblBorders>' +
        ["top", "left", "bottom", "right", "insideH", "insideV"]
          .map(border)
          .join("") +
        '</w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' +
        ('<w:gridCol w:w="' + String(col) + '"/>').repeat(width) +
        "</w:tblGrid>" +
        rows +
        "</w:tbl>" +
        paraXml("", "")
      );
    }
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
  const entries: string[] = [];
  let bookmark = 0;
  for (const block of doc.blocks) {
    if (block.kind !== "para") continue;
    const level = doc.styles[block.style]?.outlineLevel ?? 0;
    if (level < 1 || level > 3) continue;
    const name = "_Toc" + String(100000 + bookmark++);
    entries.push(
      paraXml(
        '<w:pStyle w:val="TOC' + String(level) + '"/>',
        '<w:hyperlink w:anchor="' +
          name +
          '" w:history="1">' +
          textRun(plainText(block.runs), "") +
          "</w:hyperlink>",
      ),
    );
  }
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
    paraXml('<w:pStyle w:val="TOCHeading"/>', textRun("Гарчиг", "")) +
    entries.join("") +
    paraXml("", '<w:r><w:br w:type="page"/></w:r>')
  );
}

function documentXml(doc: DocIr, options: DocxOptions, body: Body): string {
  const blocks = doc.blocks.map((block) => blockXml(block, doc, body));
  if (options.toc) {
    const first = doc.blocks[0];
    const titleFirst =
      first !== undefined &&
      first.kind === "para" &&
      (first.style === STYLE.title ||
        doc.styles[first.style]?.outlineLevel === 1);
    blocks.splice(titleFirst ? 1 : 0, 0, tocXml(doc));
  }
  const page = doc.page;
  const top = twips(page.marginTopCm);
  const sect =
    "<w:sectPr>" +
    (doc.header ? '<w:headerReference w:type="default" r:id="rId4"/>' : "") +
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
    (doc.header ? "<w:titlePg/>" : "") +
    "</w:sectPr>";
  return (
    XML_HEAD +
    "<w:document " +
    NS_W +
    " " +
    NS_R +
    "><w:body>" +
    blocks.join("") +
    sect +
    "</w:body></w:document>"
  );
}

function headerXml(doc: DocIr): string {
  const page = doc.page;
  const width = twips(page.widthCm - page.marginInnerCm - page.marginOuterCm);
  const header = doc.header!;
  const left =
    header.left !== undefined
      ? textRun(header.left, "")
      : '<w:fldSimple w:instr=" STYLEREF &quot;heading 1&quot; "><w:r><w:t></w:t></w:r></w:fldSimple>';
  const right =
    header.pageNumberRight === false
      ? ""
      : '<w:r><w:tab/></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>';
  return (
    XML_HEAD +
    "<w:hdr " +
    NS_W +
    " " +
    NS_R +
    ">" +
    paraXml(
      '<w:pStyle w:val="Header"/>' +
        (header.rule
          ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>'
          : "") +
        '<w:tabs><w:tab w:val="right" w:pos="' +
        String(width) +
        '"/></w:tabs>',
      left + right,
    ) +
    "</w:hdr>"
  );
}

function settingsXml(doc: DocIr, options: DocxOptions): string {
  return (
    XML_HEAD +
    "<w:settings " +
    NS_W +
    ">" +
    (doc.page.mirrored ? "<w:mirrorMargins/>" : "") +
    '<w:defaultTabStop w:val="709"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    (options.toc ? '<w:updateFields w:val="true"/>' : "") +
    '<w:compat><w:compatSetting w:name="compatibilityMode" ' +
    'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    "</w:settings>"
  );
}

function coreXml(doc: DocIr): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (doc.title ? "<dc:title>" + esc(doc.title) + "</dc:title>" : "") +
    "<dc:language>mn-MN</dc:language>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' +
    now +
    "</dcterms:created>" +
    "</cp:coreProperties>"
  );
}

export function buildDocx(
  doc: DocIr,
  options: DocxOptions = {},
): Uint8Array<ArrayBuffer> {
  const body: Body = { links: [], nums: [], bookmark: 0 };
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
  if (doc.header) overrides.push(["/word/header1.xml", CT + "header+xml"]);

  const files: Record<string, string> = {
    "[Content_Types].xml":
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
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
      ...(doc.header
        ? [{ id: "rId4", type: REL + "/header", target: "header1.xml" }]
        : []),
      ...body.links,
    ]),
    "word/styles.xml": stylesXml(doc),
    "word/settings.xml": settingsXml(doc, options),
    "word/numbering.xml": numberingXml(body.nums),
    "docProps/core.xml": coreXml(doc),
  };
  if (doc.header) files["word/header1.xml"] = headerXml(doc);

  const zippable: Zippable = {};
  for (const [name, xml] of Object.entries(files))
    zippable[name] = encoder.encode(xml);
  return zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>;
}
