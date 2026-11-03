import { liveMatches, replaceLive } from "./texliteral.ts";
import { cleanPath, joinPath, uncommented } from "./texproject.ts";

const USEPACKAGE =
  /\\(usepackage|RequirePackage)\s*(\[[^\]]*\]\s*)?\{([^}]*)\}/g;
const INCLUDE_SVG =
  /\\includesvg\s*((?:\[[^\]]*\]\s*)*)\{((?:[^{}]|\{[^{}]*\})*)\}/g;
const SVG_PATH = /\\svgpath\s*\{((?:\s*\{[^}]*\})*)\s*\}/g;
const SVG_SETUP = /\\svgsetup\s*\{[^{}]*\}/g;
const GRAPHIC_KEYS: ReadonlySet<string> = new Set([
  "width",
  "height",
  "totalheight",
  "scale",
  "angle",
  "origin",
  "keepaspectratio",
  "trim",
  "clip",
  "viewport",
  "draft",
]);
const PT_PER: Readonly<Record<string, number>> = {
  "": 0.75,
  px: 0.75,
  pt: 1,
  pc: 12,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};
const DEFAULT_SIZE = { width: 225, height: 112.5 };
const MONO_FAMILY = /mono|courier|consol|fixed|terminal|menlo/i;
const SANS_FAMILY =
  /sans|arial|helvetica|verdana|tahoma|calibri|segoe|roboto|inter\b|lato|ubuntu/i;
const CSS_FONT_FAMILY = /(font-family\s*:\s*)([^;}]+)/g;

function packageNames(list: string): string[] {
  return list
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function usesSvgPackage(texts: Iterable<string>): boolean {
  for (const text of texts)
    for (const match of liveMatches(text, USEPACKAGE))
      if (packageNames(match[3] ?? "").includes("svg")) return true;
  return false;
}

export function svgRefs(text: string): string[] {
  return liveMatches(text, INCLUDE_SVG).map((match) => match[2] ?? "");
}

export function svgPaths(text: string): string[] {
  const out: string[] = [];
  for (const match of uncommented(text).matchAll(SVG_PATH))
    for (const dir of (match[1] ?? "").matchAll(/\{([^}]*)\}/g))
      out.push((dir[1] ?? "").trim());
  return out;
}

export function svgCandidates(name: string): string[] {
  return /\.svg$/i.test(name) ? [name] : [name + ".svg", name];
}

export function resolveSvg(
  raw: string,
  base: string,
  searchDirs: readonly string[],
  has: (path: string) => boolean,
): string | null {
  const name = raw.trim().replace(/^"(.*)"$/, "$1");
  if (!name) return null;
  for (const dir of ["", ...searchDirs])
    for (const candidate of svgCandidates(name)) {
      const path = cleanPath(joinPath(base, dir + candidate));
      if (path && has(path)) return path;
    }
  return null;
}

export function graphicOptions(options: string): string {
  const kept: string[] = [];
  for (const group of options.matchAll(/\[([^\]]*)\]/g))
    for (const item of (group[1] ?? "").split(",")) {
      const key = item.split("=")[0]!.trim();
      if (GRAPHIC_KEYS.has(key)) kept.push(item.trim());
    }
  return kept.length ? "[" + kept.join(",") + "]" : "";
}

export function rewriteSvg(
  text: string,
  map: (raw: string) => string | null,
  label: (raw: string) => string = (raw) => raw.trim(),
): string {
  const packages = replaceLive(
    text,
    USEPACKAGE,
    (whole, command, options, list) => {
      const names = packageNames(list ?? "");
      if (!names.includes("svg")) return whole;
      const kept = [
        ...new Set(names.map((name) => (name === "svg" ? "graphicx" : name))),
      ];
      const prefix = kept.length > 1 && options ? options.trim() : "";
      return "\\" + command + prefix + "{" + kept.join(",") + "}";
    },
  );
  const setup = replaceLive(
    replaceLive(packages, SVG_PATH, () => ""),
    SVG_SETUP,
    () => "",
  );
  return replaceLive(setup, INCLUDE_SVG, (_, options, raw) => {
    const target = map(raw ?? "");
    if (target !== null)
      return (
        "\\includegraphics" + graphicOptions(options ?? "") + "{" + target + "}"
      );
    return "\\fbox{\\ttfamily\\detokenize{" + label(raw ?? "") + "}}";
  });
}

function points(value: string | null): number | null {
  const match =
    /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(
      value ?? "",
    );
  if (!match) return null;
  const size = Number(match[1]) * PT_PER[(match[2] ?? "").toLowerCase()]!;
  return size > 0 ? size : null;
}

const XML_ENCODING = /^<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/;
const SVG_NS = "http://www.w3.org/2000/svg";
const FONT_SIZE = /font-size:\s*([\d.]+)px/;
const DEFAULT_FONT_SIZE = 12;
const CHAR_WIDTH = 0.55;
const LINE_HEIGHT = 1.2;

function svgEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  const head = String.fromCharCode(...bytes.subarray(0, 200));
  return XML_ENCODING.exec(head)?.[1] ?? "utf-8";
}

export function svgText(bytes: Uint8Array): string {
  try {
    return new TextDecoder(svgEncoding(bytes)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function wrapWords(text: string, limit: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > limit) {
      lines.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  return [...lines, line];
}

function foreignText(object: Element): Element | null {
  const content = (object.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!content) return null;
  const markup = new XMLSerializer().serializeToString(object);
  const size = Number(FONT_SIZE.exec(markup)?.[1] ?? DEFAULT_FONT_SIZE);
  const width = Number(object.getAttribute("width"));
  const x = object.getAttribute("x") ?? "0";
  const y = Number(object.getAttribute("y") ?? 0);
  const limit = width > size ? width / (size * CHAR_WIDTH) : Infinity;
  const doc = object.ownerDocument;
  const text = doc.createElementNS(SVG_NS, "text");
  text.setAttribute("font-size", String(size));
  const transform = object.getAttribute("transform");
  if (transform) text.setAttribute("transform", transform);
  wrapWords(content, limit).forEach((line, at) => {
    const span = doc.createElementNS(SVG_NS, "tspan");
    span.setAttribute("x", x);
    span.setAttribute("y", String(y + size + at * size * LINE_HEIGHT));
    span.textContent = line;
    text.append(span);
  });
  return text;
}

export function flattenForeignObjects(svg: Element): void {
  for (const object of [...svg.querySelectorAll("foreignObject")]) {
    const parent = object.parentElement;
    const fallback = [...(parent?.children ?? [])].find(
      (child) => child !== object,
    );
    if (parent?.localName === "switch" && fallback)
      parent.replaceWith(fallback);
    else {
      const text = foreignText(object);
      if (text) object.replaceWith(text);
      else object.remove();
    }
  }
}

export function svgSize(
  width: string | null,
  height: string | null,
  viewBox: string | null,
): { width: number; height: number } {
  const box = (viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const ratio =
    box.length === 4 && box[2]! > 0 && box[3]! > 0 ? box[3]! / box[2]! : null;
  const w = points(width);
  const h = points(height);
  if (w && h) return { width: w, height: h };
  if (w && ratio) return { width: w, height: w * ratio };
  if (h && ratio) return { width: h / ratio, height: h };
  if (ratio) return { width: box[2]! * 0.75, height: box[3]! * 0.75 };
  return DEFAULT_SIZE;
}

export async function svgToPdf(bytes: Uint8Array): Promise<Uint8Array | null> {
  const { renderSvg } = await import("./svgpdf.ts");
  return renderSvg(bytes);
}

export function genericFamily(family: string): string {
  if (MONO_FAMILY.test(family)) return "monospace";
  if (SANS_FAMILY.test(family)) return "sans-serif";
  return "serif";
}

export function genericCss(css: string): string {
  return css.replace(
    CSS_FONT_FAMILY,
    (_, property: string, family: string) => property + genericFamily(family),
  );
}
