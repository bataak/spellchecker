import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GLYPH_BOX, glyphId, symbolTex } from "../src/tex/texglyphs.ts";
import { TEX_TOOLS } from "../src/tex/texmenudata.ts";

const OUT = new URL("../src/tex/texglyphs.svg", import.meta.url);
const ORIGIN = 72;

const PREAMBLE = String.raw`\documentclass[multi=g,border=0pt]{standalone}
\usepackage{amsmath,amssymb}
\newenvironment{g}{\vrule width 0pt height 10pt depth 4pt$}{$}
\begin{document}
`;

function sources(): string[] {
  const out = new Set<string>();
  for (const tool of TEX_TOOLS) {
    if (tool.tex) out.add(tool.tex);
    if (tool.kind === "palette")
      for (const tab of tool.tabs)
        for (const symbol of tab.symbols) out.add(symbolTex(symbol.command));
  }
  return [...out];
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(command + " амжилтгүй:\n" + result.stdout + result.stderr);
}

function attr(tag: string, name: string): string {
  const found = new RegExp("\\s" + name + "='([^']*)'").exec(tag);
  if (!found) throw new Error(name + " олдсонгүй: " + tag);
  return found[1]!;
}

const num = (value: number): string => String(Math.round(value * 1000) / 1000);

function symbolOf(svg: string, tex: string): string {
  const width = Number(
    attr(/<svg[^>]*>/.exec(svg)![0], "viewBox").split(" ")[2],
  );
  const shift = ORIGIN + (GLYPH_BOX.width - width) / 2;
  const paths = new Map(
    [...svg.matchAll(/<path[^>]*>/g)].map(([tag]) => [
      attr(tag, "id"),
      attr(tag, "d"),
    ]),
  );
  const body = /<g id='page\d+'>([\s\S]*?)<\/g>/.exec(svg)![1]!;
  const shapes = [...body.matchAll(/<(use|rect)[^>]*>/g)].map(([tag, kind]) => {
    const x = num(Number(attr(tag, "x")) + shift);
    const y = num(Number(attr(tag, "y")) + ORIGIN);
    if (kind === "rect")
      return `<rect x="${x}" y="${y}" width="${attr(tag, "width")}" height="${attr(tag, "height")}"/>`;
    const d = paths.get(attr(tag, "xlink:href").slice(1));
    return `<path transform="translate(${x} ${y})" d="${d}"/>`;
  });
  const box = "0 0 " + GLYPH_BOX.width + " " + GLYPH_BOX.height;
  return `<symbol id="${glyphId(tex)}" viewBox="${box}">${shapes.join("")}</symbol>`;
}

const list = sources();
const dir = mkdtempSync(join(tmpdir(), "texglyphs-"));
try {
  const pages = list.map((tex) => "\\begin{g}" + tex + "\\end{g}").join("\n");
  writeFileSync(join(dir, "g.tex"), PREAMBLE + pages + "\n\\end{document}\n");
  run("latex", ["-interaction=nonstopmode", "-halt-on-error", "g.tex"], dir);
  run(
    "dvisvgm",
    [
      "--no-fonts",
      "--page=1-",
      "--bbox=papersize",
      "--precision=2",
      "-o",
      "g-%3p.svg",
      "g.dvi",
    ],
    dir,
  );
  const symbols = list.map((tex, at) =>
    symbolOf(
      readFileSync(
        join(dir, `g-${String(at + 1).padStart(3, "0")}.svg`),
        "utf8",
      ),
      tex,
    ),
  );
  writeFileSync(
    OUT,
    '<svg xmlns="http://www.w3.org/2000/svg">\n' +
      symbols.join("\n") +
      "\n</svg>\n",
  );
  console.log(symbols.length + " тэмдэг → " + OUT.pathname);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
