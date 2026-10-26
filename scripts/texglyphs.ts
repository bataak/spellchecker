import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PALETTE_GLYPH,
  TOOL_GLYPH,
  glyphId,
  symbolTex,
  type GlyphFrame,
} from "../src/tex/texglyphs.ts";
import { TEX_TOOLS } from "../src/tex/texmenudata.ts";

const OUT = new URL("../src/tex/texglyphs.svg", import.meta.url);
const ORIGIN = 72;
const FIXED_STROKE = ' vector-effect="non-scaling-stroke"';

const PREAMBLE = String.raw`\documentclass[multi=g,border=0pt]{standalone}
\usepackage{amsmath,amssymb}
\newenvironment{g}{\vrule width 0pt height 10pt depth 4pt$}{$}
\begin{document}
`;

interface Job {
  readonly tex: string;
  readonly frame: GlyphFrame;
}

function jobs(): Job[] {
  const out = new Map<string, Job>();
  const add = (tex: string, frame: GlyphFrame): void => {
    out.set(glyphId(tex, frame), { tex, frame });
  };
  for (const tool of TEX_TOOLS) {
    if (tool.tex) add(tool.tex, TOOL_GLYPH);
    if (tool.kind === "palette")
      for (const tab of tool.tabs)
        for (const symbol of tab.symbols)
          add(symbolTex(symbol.command), PALETTE_GLYPH);
  }
  return [...out.values()];
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

function viewBox(svg: string): number[] {
  return attr(/<svg[^>]*>/.exec(svg)![0], "viewBox")
    .split(" ")
    .map(Number);
}

function shapes(svg: string, dx: number, dy: number, extra = ""): string {
  const paths = new Map(
    [...svg.matchAll(/<path[^>]*>/g)].map(([tag]) => [
      attr(tag, "id"),
      attr(tag, "d"),
    ]),
  );
  const body = /<g id='page\d+'>([\s\S]*?)<\/g>/.exec(svg)![1]!;
  return [...body.matchAll(/<(use|rect)[^>]*>/g)]
    .map(([tag, kind]) => {
      const x = num(Number(attr(tag, "x")) + dx);
      const y = num(Number(attr(tag, "y")) + dy);
      if (kind === "rect")
        return `<rect${extra} x="${x}" y="${y}" width="${attr(tag, "width")}" height="${attr(tag, "height")}"/>`;
      const d = paths.get(attr(tag, "xlink:href").slice(1));
      return `<path${extra} transform="translate(${x} ${y})" d="${d}"/>`;
    })
    .join("");
}

function onBaseline(page: string, frame: GlyphFrame): string {
  const width = viewBox(page)[2]!;
  return shapes(page, ORIGIN + (frame.width - width) / 2, ORIGIN);
}

function fitted(ink: string, frame: GlyphFrame): string {
  const [x, y, width, height] = viewBox(ink) as [
    number,
    number,
    number,
    number,
  ];
  const scale = Math.min(frame.height / height, frame.width / width);
  const dx = (frame.width - width * scale) / 2 - x * scale;
  const dy = (frame.height - height * scale) / 2 - y * scale;
  const move = `translate(${num(dx)} ${num(dy)}) scale(${num(scale)})`;
  return `<g transform="${move}">${shapes(ink, 0, 0, FIXED_STROKE)}</g>`;
}

function symbolOf(job: Job, page: string, ink: string): string {
  const { tex, frame } = job;
  const body = frame.fit ? fitted(ink, frame) : onBaseline(page, frame);
  const box = "0 0 " + frame.width + " " + frame.height;
  return `<symbol id="${glyphId(tex, frame)}" viewBox="${box}">${body}</symbol>`;
}

function convert(dir: string, bbox: string, prefix: string): void {
  run(
    "dvisvgm",
    [
      "--no-fonts",
      "--page=1-",
      "--bbox=" + bbox,
      "--precision=2",
      "-o",
      prefix + "-%3p.svg",
      "g.dvi",
    ],
    dir,
  );
}

const pageFile = (dir: string, prefix: string, at: number): string =>
  readFileSync(
    join(dir, `${prefix}-${String(at + 1).padStart(3, "0")}.svg`),
    "utf8",
  );

const list = jobs();
const dir = mkdtempSync(join(tmpdir(), "texglyphs-"));
try {
  const pages = list
    .map((job) => "\\begin{g}" + job.tex + "\\end{g}")
    .join("\n");
  writeFileSync(join(dir, "g.tex"), PREAMBLE + pages + "\n\\end{document}\n");
  run("latex", ["-interaction=nonstopmode", "-halt-on-error", "g.tex"], dir);
  convert(dir, "papersize", "g");
  run(
    "dvisvgm",
    [
      "--no-fonts",
      "--page=1-",
      "--exact-bbox",
      "--precision=2",
      "-o",
      "e-%3p.svg",
      "g.dvi",
    ],
    dir,
  );
  const symbols = list.map((job, at) =>
    symbolOf(job, pageFile(dir, "g", at), pageFile(dir, "e", at)),
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
