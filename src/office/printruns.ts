import {
  type IrImage,
  type PreparedImage,
  type IrRun,
  type ImageSet,
  imageKey,
} from "./docir.ts";
import { escapeAttr } from "../core/htmlutil.ts";

export const TEXT_ALIGN: Readonly<Record<string, string>> = {
  start: "left",
  center: "center",
  end: "right",
  justify: "justify",
};

export function className(name: string): string {
  return "s-" + name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function imageHtml(image: IrImage, prepared: PreparedImage): string {
  const width =
    image.widthPercent !== undefined
      ? "width:" + String(image.widthPercent) + "%"
      : prepared.widthPx > 0
        ? "width:" + String(prepared.widthPx) + "px"
        : "";
  return (
    '<img class="image" src="' +
    escapeAttr(prepared.url) +
    '" alt=""' +
    (width ? ' data-style="' + width + '"' : "") +
    ">"
  );
}

export function runsHtml(runs: readonly IrRun[], images: ImageSet): string {
  let out = "";
  for (const run of runs) {
    if (run.image) {
      const prepared = images.get(imageKey(run.image));
      if (prepared) out += imageHtml(run.image, prepared);
      continue;
    }
    if (run.tab) {
      out += '<span class="tab"></span>';
      continue;
    }
    if (run.fill) {
      out += '<span class="fill"></span>';
      continue;
    }
    if (!run.text) continue;
    let body = escapeAttr(run.text).replace(/\n/g, "<br>");
    if (run.mono) body = '<span class="mono">' + body + "</span>";
    if (run.strike) body = "<s>" + body + "</s>";
    if (run.italic) body = "<i>" + body + "</i>";
    if (run.bold) body = "<b>" + body + "</b>";
    if (run.href)
      body = '<a href="' + escapeAttr(run.href) + '">' + body + "</a>";
    out += body;
  }
  return out;
}

export function para(
  style: string,
  runs: readonly IrRun[],
  images: ImageSet,
): string {
  return (
    '<p class="' +
    className(style) +
    '">' +
    (runsHtml(runs, images) || "<br>") +
    "</p>"
  );
}

export function verbatimPara(
  style: string,
  runs: readonly IrRun[],
  images: ImageSet,
): string {
  const lines = runs.map((run) => runsHtml([run], images)).join("<br>");
  return (
    '<p class="' + className(style) + ' verbatim">' + (lines || "<br>") + "</p>"
  );
}
