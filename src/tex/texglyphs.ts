const SPRITE = new URL("./texglyphs.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";
const ARGUMENT = "{#}";

export const GLYPH_BOX = { width: 20, height: 14 } as const;

export function glyphId(tex: string): string {
  return (
    "g" +
    tex.replace(
      /[^A-Za-z0-9]/g,
      (char) => "-" + char.charCodeAt(0).toString(16),
    )
  );
}

export function symbolTex(command: string): string {
  return "\\" + command.replace(ARGUMENT, "{\\phantom{x}}");
}

export function glyphSvg(tex: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "tex-glyph");
  svg.setAttribute(
    "viewBox",
    "0 0 " + GLYPH_BOX.width + " " + GLYPH_BOX.height,
  );
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", SPRITE + "#" + glyphId(tex));
  svg.append(use);
  return svg;
}
