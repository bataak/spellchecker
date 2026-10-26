const SPRITE = new URL("./texglyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const ARGUMENT = "{#}";

export interface GlyphFrame {
  readonly prefix: string;
  readonly width: number;
  readonly height: number;
  readonly fit: boolean;
}

export const PALETTE_GLYPH: GlyphFrame = {
  prefix: "g",
  width: 20,
  height: 14,
  fit: false,
};

export const TOOL_GLYPH: GlyphFrame = {
  prefix: "t",
  width: 20,
  height: 14,
  fit: true,
};

export function glyphId(tex: string, frame = PALETTE_GLYPH): string {
  return (
    frame.prefix +
    tex.replace(
      /[^A-Za-z0-9]/g,
      (char) => "-" + char.charCodeAt(0).toString(16),
    )
  );
}

export function symbolTex(command: string): string {
  return "\\" + command.replace(ARGUMENT, "{\\phantom{x}}");
}

export function glyphSvg(tex: string, frame = PALETTE_GLYPH): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tex-glyph");
  svg.setAttribute("viewBox", "0 0 " + frame.width + " " + frame.height);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", SPRITE + "#" + glyphId(tex, frame));
  svg.append(use);
  return svg;
}
