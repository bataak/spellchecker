import type { DocIr } from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";
import { XML_HEAD } from "../ooxml.ts";
import { NS_W } from "./styles.ts";

export const NS_R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function paraXml(pPr: string, inner: string): string {
  return "<w:p>" + (pPr ? "<w:pPr>" + pPr + "</w:pPr>" : "") + inner + "</w:p>";
}

export function footerXml(): string {
  return (
    XML_HEAD +
    "<w:ftr " +
    NS_W +
    " " +
    NS_R +
    ">" +
    paraXml(
      '<w:pStyle w:val="Footer"/>',
      '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>',
    ) +
    "</w:ftr>"
  );
}

export function settingsXml(doc: DocIr, toc: boolean): string {
  return (
    XML_HEAD +
    "<w:settings " +
    NS_W +
    ">" +
    (doc.page.mirrored ? "<w:mirrorMargins/>" : "") +
    '<w:defaultTabStop w:val="709"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    (toc ? '<w:updateFields w:val="true"/>' : "") +
    '<w:compat><w:compatSetting w:name="compatibilityMode" ' +
    'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    "</w:settings>"
  );
}

export function coreXml(doc: DocIr): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return (
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (doc.title ? "<dc:title>" + xmlAttr(doc.title) + "</dc:title>" : "") +
    "<dc:language>mn-MN</dc:language>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' +
    now +
    "</dcterms:created>" +
    "</cp:coreProperties>"
  );
}
