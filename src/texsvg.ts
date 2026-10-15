import { cleanPath, joinPath, uncommented } from "./texproject.ts";

const USEPACKAGE = /\\usepackage\s*(\[[^\]]*\]\s*)?\{([^}]*)\}/g;
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

function packageNames(list: string): string[] {
  return list
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function usesSvgPackage(texts: Iterable<string>): boolean {
  for (const text of texts)
    for (const match of uncommented(text).matchAll(USEPACKAGE))
      if (packageNames(match[2] ?? "").includes("svg")) return true;
  return false;
}

export function svgRefs(text: string): string[] {
  return [...uncommented(text).matchAll(INCLUDE_SVG)].map(
    (match) => match[2] ?? "",
  );
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
  return text
    .replace(USEPACKAGE, (whole, options: string | undefined, list: string) => {
      const names = packageNames(list);
      if (!names.includes("svg")) return whole;
      const kept = [
        ...new Set(names.map((name) => (name === "svg" ? "graphicx" : name))),
      ];
      const prefix = kept.length > 1 && options ? options.trim() : "";
      return "\\usepackage" + prefix + "{" + kept.join(",") + "}";
    })
    .replace(SVG_PATH, "")
    .replace(SVG_SETUP, "")
    .replace(INCLUDE_SVG, (_, options: string | undefined, raw: string) => {
      const target = map(raw);
      if (target !== null)
        return (
          "\\includegraphics" + graphicOptions(options ?? "") + "{" + target + "}"
        );
      return "\\fbox{\\ttfamily\\detokenize{" + label(raw) + "}}";
    });
}

function points(value: string | null): number | null {
  const match = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(
    value ?? "",
  );
  if (!match) return null;
  const size = Number(match[1]) * PT_PER[(match[2] ?? "").toLowerCase()]!;
  return size > 0 ? size : null;
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
