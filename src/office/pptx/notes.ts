import { XML_HEAD } from "../ooxml.ts";
import { NS_ALL, TREE_HEAD } from "./parts.ts";

const IMAGE = { x: 1143000, y: 685800, w: 4572000, h: 2571750 };
const BODY = { x: 685800, y: 3600450, w: 5486400, h: 4800600 };

const box = (b: typeof IMAGE): string =>
  '<p:spPr><a:xfrm><a:off x="' +
  String(b.x) +
  '" y="' +
  String(b.y) +
  '"/><a:ext cx="' +
  String(b.w) +
  '" cy="' +
  String(b.h) +
  '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>';

function placeholders(geometry: boolean, body: string): string {
  return (
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>' +
    '<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr>' +
    (geometry ? box(IMAGE) : "<p:spPr/>") +
    "</p:sp>" +
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>' +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
    '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    (geometry ? box(BODY) : "<p:spPr/>") +
    "<p:txBody><a:bodyPr/><a:lstStyle/>" +
    (body || "<a:p><a:endParaRPr/></a:p>") +
    "</p:txBody></p:sp>"
  );
}

export const NOTES_MASTER =
  XML_HEAD +
  "<p:notesMaster " +
  NS_ALL +
  "><p:cSld>" +
  '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
  "<p:spTree>" +
  TREE_HEAD +
  placeholders(true, "") +
  "</p:spTree></p:cSld>" +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
  'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
  'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  "</p:notesMaster>";

export function notesSlideXml(body: string): string {
  return (
    XML_HEAD +
    "<p:notes " +
    NS_ALL +
    "><p:cSld><p:spTree>" +
    TREE_HEAD +
    placeholders(false, body) +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
  );
}
