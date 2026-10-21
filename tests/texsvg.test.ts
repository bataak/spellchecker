import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genericCss,
  genericFamily,
  graphicOptions,
  resolveSvg,
  rewriteSvg,
  svgPaths,
  svgRefs,
  svgSize,
  usesSvgPackage,
} from "../src/tex/texsvg.ts";

test("svg багцыг жагсаалт дотор ч таньж, тайлбарт байвал үл тооно", () => {
  assert.equal(usesSvgPackage([String.raw`\usepackage{graphicx, svg}`]), true);
  assert.equal(
    usesSvgPackage([String.raw`\usepackage[inkscapelatex=false]{svg}`]),
    true,
  );
  assert.equal(usesSvgPackage([String.raw`% \usepackage{svg}`]), false);
  assert.equal(usesSvgPackage([String.raw`\usepackage{svgcolor}`]), false);
});

test("includesvg болон svgpath-ийн замыг цуглуулна", () => {
  const text = String.raw`\svgpath{{fig/}{img/svg/}}
\includesvg[width=0.5\linewidth]{diagram}
% \includesvg{hidden}
\includesvg{logo.svg}`;
  assert.deepEqual(svgRefs(text), ["diagram", "logo.svg"]);
  assert.deepEqual(svgPaths(text), ["fig/", "img/svg/"]);
});

test("graphicx-д ойлгогдох түлхүүрийг л үлдээнэ", () => {
  assert.equal(
    graphicOptions("[width=5cm, inkscapelatex=false,angle=90]"),
    "[width=5cm,angle=90]",
  );
  assert.equal(graphicOptions("[inkscapearea=page]"), "");
});

test("svg багцыг graphicx болгож, includesvg-г includegraphics болгоно", () => {
  const text = String.raw`\usepackage[inkscapelatex=false]{svg}
\usepackage{amsmath,svg}
\svgpath{{fig/}}
\svgsetup{inkscapelatex=false}
\includesvg[width=5cm,inkscapelatex=false]{diagram}
\includesvg{missing}`;
  assert.equal(
    rewriteSvg(text, (raw) =>
      raw === "diagram" ? "fig/diagram.converted.pdf" : null,
    ),
    String.raw`\usepackage{graphicx}
\usepackage{amsmath,graphicx}


\includegraphics[width=5cm]{fig/diagram.converted.pdf}
\fbox{\ttfamily\detokenize{missing}}`,
  );
});

test("svg-г .svg өргөтгөлөөр болон хайх хавтаснаас олно", () => {
  const files = new Set(["doc/fig/diagram.svg", "doc/logo.svg"]);
  const has = (path: string): boolean => files.has(path);
  assert.equal(
    resolveSvg("diagram", "doc", ["fig/"], has),
    "doc/fig/diagram.svg",
  );
  assert.equal(resolveSvg("logo.svg", "doc", [], has), "doc/logo.svg");
  assert.equal(resolveSvg("none", "doc", ["fig/"], has), null);
});

test("svg-ийн хэмжээг пункт уруу хөрвүүлнэ", () => {
  assert.deepEqual(svgSize("100", "50", null), { width: 75, height: 37.5 });
  assert.deepEqual(svgSize("2in", null, "0 0 200 100"), {
    width: 144,
    height: 72,
  });
  assert.deepEqual(svgSize("100%", "100%", "0 0 400 200"), {
    width: 300,
    height: 150,
  });
  assert.deepEqual(svgSize(null, null, null), { width: 225, height: 112.5 });
});

test("svg-ийн фонтын нэрийг serif, sans-serif, monospace болгож буулгана", () => {
  assert.equal(genericFamily("'Courier New', monospace"), "monospace");
  assert.equal(genericFamily("DejaVu Sans Mono"), "monospace");
  assert.equal(genericFamily("Arial, Helvetica"), "sans-serif");
  assert.equal(genericFamily("Times New Roman"), "serif");
  assert.equal(
    genericCss(`font-family:'Courier New';fill:red`),
    "font-family:monospace;fill:red",
  );
  assert.equal(
    genericCss(
      `.t{font-family: "Times New Roman", serif} .s{font-family:Arial}`,
    ),
    ".t{font-family: serif} .s{font-family:sans-serif}",
  );
});
