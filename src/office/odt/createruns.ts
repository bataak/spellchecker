import {
  type ImageFiles,
  type PageSpec,
  type IrImage,
  imageKey,
  imageSizeCm,
  type IrRun,
} from "../docir.ts";
import { cm } from "../units.ts";
import { runKey, styleName } from "./props.ts";
import { verbatimText, xmlText, xmlAttr } from "../sanitize.ts";

export interface Media {
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

export function runsXml(
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

export function paraXml(
  style: string,
  runs: readonly IrRun[],
  level: number,
  media: Media,
  verbatim = false,
): string {
  const inner = runsXml(runs, media, verbatim);
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
