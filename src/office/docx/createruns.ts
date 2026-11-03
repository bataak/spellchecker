import { type Rel, REL } from "../ooxml.ts";
import { type NumDef, MONO } from "./styles.ts";
import {
  type PageSpec,
  type ImageFiles,
  type IrImage,
  imageKey,
  imageSizeCm,
  type IrRun,
} from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";

const EMU_CM = 360000;

const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";

const PICTURE = "http://schemas.openxmlformats.org/drawingml/2006/picture";

export interface Body {
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

export function textRun(text: string, rPr: string): string {
  return (
    "<w:r>" +
    (rPr ? "<w:rPr>" + rPr + "</w:rPr>" : "") +
    '<w:t xml:space="preserve">' +
    xmlAttr(text) +
    "</w:t></w:r>"
  );
}

export function runsXml(
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
