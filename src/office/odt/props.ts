import { odfFont } from "../fonts.ts";
import type { IrRun, ParaStyle } from "../docir.ts";
import { xmlAttr } from "../sanitize.ts";

export const NS =
  ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
  ' xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"' +
  ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"' +
  ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
  ' xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"' +
  ' xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"' +
  ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
  ' xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"';

export const MONO = odfFont("Courier New");

export function cm(value: number): string {
  return value.toFixed(3) + "cm";
}

export function pt(value: number): string {
  return value.toFixed(1) + "pt";
}

const ALIGN: Record<string, string> = {
  start: "start",
  center: "center",
  end: "end",
  justify: "justify",
};

export function paraProps(style: ParaStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push('fo:text-align="' + ALIGN[style.align] + '"');
  if (style.lineHeightPercent !== undefined)
    parts.push('fo:line-height="' + String(style.lineHeightPercent) + '%"');
  if (style.firstLineIndentCm !== undefined)
    parts.push('fo:text-indent="' + cm(style.firstLineIndentCm) + '"');
  if (style.marginLeftCm !== undefined)
    parts.push('fo:margin-left="' + cm(style.marginLeftCm) + '"');
  if (style.marginRightCm !== undefined)
    parts.push('fo:margin-right="' + cm(style.marginRightCm) + '"');
  if (style.spaceBeforePt !== undefined)
    parts.push('fo:margin-top="' + pt(style.spaceBeforePt) + '"');
  if (style.spaceAfterPt !== undefined)
    parts.push('fo:margin-bottom="' + pt(style.spaceAfterPt) + '"');
  if (style.breakBefore) parts.push('fo:break-before="page"');
  if (style.keepWithNext) parts.push('fo:keep-with-next="always"');
  if (style.borderBottom)
    parts.push(
      'fo:border-bottom="0.5pt solid #000000"',
      'fo:padding-bottom="2pt"',
    );
  parts.push('fo:orphans="2"', 'fo:widows="2"');

  return "<style:paragraph-properties " + parts.join(" ") + "/>";
}

export function textProps(style: ParaStyle, base: string): string {
  const parts: string[] = [];
  if (style.sizePt !== undefined)
    parts.push('fo:font-size="' + pt(style.sizePt) + '"');
  if (style.bold) parts.push('fo:font-weight="bold"');
  if (style.italic) parts.push('fo:font-style="italic"');
  if (style.mono) parts.push('fo:font-family="&apos;' + MONO + '&apos;"');
  else parts.push('fo:font-family="' + xmlAttr(base) + '"');
  if (style.noHyphenation) parts.push('fo:hyphenate="false"');
  if (parts.length === 0) return "";
  return "<style:text-properties " + parts.join(" ") + "/>";
}

export function runKey(run: IrRun): string {
  return (
    (run.bold ? "b" : "") +
    (run.italic ? "i" : "") +
    (run.mono ? "m" : "") +
    (run.strike ? "s" : "") +
    (run.href ? "l" : "")
  );
}

export function runStyle(key: string, base: string): string {
  const parts: string[] = [];
  if (key.includes("b")) parts.push('fo:font-weight="bold"');
  if (key.includes("i")) parts.push('fo:font-style="italic"');
  if (key.includes("s")) parts.push('style:text-line-through-style="solid"');
  if (key.includes("m"))
    parts.push('fo:font-family="&apos;' + MONO + '&apos;"');
  else parts.push('fo:font-family="' + xmlAttr(base) + '"');
  return (
    '<style:style style:name="T_' +
    (key || "plain") +
    '" style:family="text"><style:text-properties ' +
    parts.join(" ") +
    "/></style:style>"
  );
}

export function styleName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}
