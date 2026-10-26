import { odfFont } from "../fonts.ts";
import type { DeckLine } from "../deck.ts";
import type { IrRun } from "../docir.ts";
import { xmlAttr, xmlText } from "../sanitize.ts";

export const FONT = odfFont("Arial");
const MONO = odfFont("Courier New");

export const PAGE = { width: 28, height: 15.75 };
export const MARGIN = 1.4;

export const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"' +
  ' xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
  ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
  ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
  ' xmlns:xlink="http://www.w3.org/1999/xlink"';

export function cm(value: number): string {
  return value.toFixed(2) + "cm";
}

function spaced(text: string): string {
  return text.split("\n").map(spacedLine).join("<text:line-break/>");
}

function spacedLine(text: string): string {
  return text
    .split(/( {2,}|^ |\t)/)
    .map((part) => {
      if (part === "\t") return "<text:tab/>";
      if (/^ +$/.test(part))
        return part.length === 1
          ? "<text:s/>"
          : '<text:s text:c="' + String(part.length) + '"/>';
      return xmlText(part);
    })
    .join("");
}

function runKey(run: IrRun): string {
  return (
    (run.bold ? "b" : "") +
    (run.italic ? "i" : "") +
    (run.mono ? "m" : "") +
    (run.strike ? "s" : "")
  );
}

export function runStyle(key: string): string {
  const parts: string[] = [];
  if (key.includes("b")) parts.push('fo:font-weight="bold"');
  if (key.includes("i")) parts.push('fo:font-style="italic"');
  if (key.includes("s")) parts.push('style:text-line-through-style="solid"');
  if (key.includes("m")) parts.push('fo:font-family="' + MONO + '"');
  return (
    '<style:style style:name="T_' +
    key +
    '" style:family="text"><style:text-properties ' +
    parts.join(" ") +
    "/></style:style>"
  );
}

function runsXml(runs: readonly IrRun[], keys: Set<string>): string {
  let out = "";
  for (const run of runs) {
    if (!run.text) continue;
    const key = runKey(run);
    if (key) keys.add(key);
    const body = key
      ? '<text:span text:style-name="T_' +
        key +
        '">' +
        spaced(run.text) +
        "</text:span>"
      : spaced(run.text);
    out += run.href
      ? '<text:a xlink:type="simple" xlink:href="' +
        xmlAttr(run.href) +
        '">' +
        body +
        "</text:a>"
      : body;
  }
  return out;
}

export function para(
  style: string,
  runs: readonly IrRun[],
  keys: Set<string>,
): string {
  return (
    '<text:p text:style-name="' +
    style +
    '">' +
    runsXml(runs, keys) +
    "</text:p>"
  );
}

export function linesXml(
  lines: readonly DeckLine[],
  keys: Set<string>,
  style = "P_body",
): string {
  let out = "";
  let open: "bullet" | "number" | null = null;
  const close = (): void => {
    if (open !== null) out += "</text:list>";
    open = null;
  };
  for (const line of lines) {
    if (line.kind === "para") {
      close();
      out += para(style, line.runs, keys);
      continue;
    }
    if (open !== line.kind || line.start !== undefined) {
      close();
      out +=
        '<text:list text:style-name="' +
        (line.kind === "bullet" ? "L_bullet" : "L_number") +
        '">';
      open = line.kind;
    }
    out +=
      "<text:list-item" +
      (line.start !== undefined && line.start !== 1
        ? ' text:start-value="' + String(line.start) + '"'
        : "") +
      ">" +
      para(style, line.runs, keys) +
      "</text:list-item>";
  }
  close();
  return out;
}

export function frame(
  cls: string,
  style: string,
  box: { x: number; y: number; w: number; h: number },
  inner: string,
): string {
  return (
    '<draw:frame presentation:class="' +
    cls +
    '" presentation:style-name="' +
    style +
    '" svg:x="' +
    cm(box.x) +
    '" svg:y="' +
    cm(box.y) +
    '" svg:width="' +
    cm(box.w) +
    '" svg:height="' +
    cm(box.h) +
    '"><draw:text-box>' +
    inner +
    "</draw:text-box></draw:frame>"
  );
}

export function page(index: number, frames: string, notes = ""): string {
  return (
    '<draw:page draw:name="page' +
    String(index) +
    '" draw:style-name="dp1" draw:master-page-name="Default">' +
    frames +
    (notes
      ? "<presentation:notes>" +
        frame("notes", "pr_body", { x: 2, y: 14, w: 17, h: 12 }, notes) +
        "</presentation:notes>"
      : "") +
    "</draw:page>"
  );
}
