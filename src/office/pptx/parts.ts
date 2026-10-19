import { XML_HEAD } from "../ooxml.ts";

export const FONT = "Arial";

export const WIDTH = 12192000;
export const HEIGHT = 6858000;

export const NS_A =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
export const NS_ALL = NS_A + " " + NS_R + " " + NS_P;

export const CT =
  "application/vnd.openxmlformats-officedocument.presentationml.";

export const TREE_HEAD =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

export const THEME =
  XML_HEAD +
  "<a:theme " +
  NS_A +
  ' name="Office"><a:themeElements>' +
  '<a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F497D"/></a:dk2>' +
  '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>' +
  '<a:accent2><a:srgbClr val="C0504D"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>' +
  '<a:accent4><a:srgbClr val="8064A2"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>' +
  '<a:accent6><a:srgbClr val="F79646"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0000FF"/></a:hlink>' +
  '<a:folHlink><a:srgbClr val="800080"/></a:folHlink>' +
  "</a:clrScheme>" +
  '<a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="' +
  FONT +
  '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="' +
  FONT +
  '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  "</a:fontScheme>" +
  '<a:fmtScheme name="Office">' +
  "<a:fillStyleLst>" +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  "</a:fillStyleLst><a:lnStyleLst>" +
  '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(
    3,
  ) +
  "</a:lnStyleLst><a:effectStyleLst>" +
  "<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3) +
  "</a:effectStyleLst><a:bgFillStyleLst>" +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  "</a:bgFillStyleLst></a:fmtScheme>" +
  "</a:themeElements></a:theme>";

export const MASTER =
  XML_HEAD +
  "<p:sldMaster " +
  NS_ALL +
  "><p:cSld>" +
  '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
  "<p:spTree>" +
  TREE_HEAD +
  "</p:spTree></p:cSld>" +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" ' +
  'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" ' +
  'accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  "<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>" +
  "</p:sldMaster>";

export const LAYOUT =
  XML_HEAD +
  "<p:sldLayout " +
  NS_ALL +
  ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>' +
  TREE_HEAD +
  "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

export function presentationXml(count: number): string {
  let ids = "";
  for (let i = 0; i < count; i++)
    ids +=
      '<p:sldId id="' + String(256 + i) + '" r:id="rId' + String(i + 3) + '"/>';
  return (
    XML_HEAD +
    "<p:presentation " +
    NS_ALL +
    ' saveSubsetFonts="1">' +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (count ? "<p:sldIdLst>" + ids + "</p:sldIdLst>" : "") +
    '<p:sldSz cx="' +
    String(WIDTH) +
    '" cy="' +
    String(HEIGHT) +
    '"/><p:notesSz cx="6858000" cy="9144000"/>' +
    "</p:presentation>"
  );
}

export function contentTypesXml(
  count: number,
  exts: readonly string[],
): string {
  let slides = "";
  for (let i = 1; i <= count; i++)
    slides +=
      '<Override PartName="/ppt/slides/slide' +
      String(i) +
      '.xml" ContentType="' +
      CT +
      'slide+xml"/>';
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    exts
      .map(
        (ext) =>
          '<Default Extension="' + ext + '" ContentType="image/' + ext + '"/>',
      )
      .join("") +
    '<Override PartName="/ppt/presentation.xml" ContentType="' +
    CT +
    'presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="' +
    CT +
    'slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="' +
    CT +
    'slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    slides +
    "</Types>"
  );
}
