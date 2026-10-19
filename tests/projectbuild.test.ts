import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProject,
  type BuildSource,
  type Converters,
} from "../src/project/projectbuild.ts";
import { ProjectError } from "../src/project/projecterror.ts";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (data: Uint8Array | string | undefined): string =>
  typeof data === "string" ? data : new TextDecoder().decode(data);

const FAKE: Converters = {
  raster: async (bytes) =>
    dec(bytes).includes("bad") ? null : enc("png:" + dec(bytes)),
  svg: async (bytes) =>
    dec(bytes).includes("bad") ? null : enc("pdf:" + dec(bytes)),
};

function source(
  main: string | null,
  texts: Record<string, string>,
  binaries: Record<string, string> = {},
): BuildSource {
  return {
    main,
    texts: new Map(Object.entries(texts)),
    binaries: new Map(
      Object.entries(binaries).map(([path, data]) => [path, enc(data)]),
    ),
  };
}

test("buildProject: үндсэн файлгүй бол ProjectError", async () => {
  await assert.rejects(buildProject(source(null, {}), FAKE), ProjectError);
});

test("buildProject: ажлын хавтас, үндсэн файл, хавтсуудыг гаргана", async () => {
  const build = await buildProject(
    source(
      "paper/main.tex",
      {
        "paper/main.tex": "\\input{sec/a}\n\\tableofcontents",
        "paper/sec/a.tex": "A",
      },
      { "paper/data/deep/x.bin": "x" },
    ),
    FAKE,
  );
  assert.equal(build.workdir, "paper");
  assert.equal(build.main, "main.tex");
  assert.equal(build.mainText, "\\input{sec/a}\n\\tableofcontents");
  assert.equal(build.files["paper/sec/a.tex"], "A");
  assert.equal(dec(build.files["paper/data/deep/x.bin"]), "x");
  assert.equal(build.files["paper/main.tex"], undefined);
  assert.deepEqual(build.dirs, [
    "paper",
    "paper/sec",
    "paper/data",
    "paper/data/deep",
  ]);
  assert.ok(build.passes >= 2);
  assert.deepEqual(build.missing, []);
});

test("buildProject: png/jpg/pdf-ийг хэвээр, бусад растрыг PNG болгоно", async () => {
  const build = await buildProject(
    source(
      "main.tex",
      {
        "main.tex": [
          "\\graphicspath{{img/}}",
          "\\includegraphics{photo}",
          "\\includegraphics{plot.pdf}",
          "\\includegraphics{anim.gif}",
          "\\includegraphics[width=2cm]{anim.gif}",
        ].join("\n"),
      },
      { "img/photo.jpg": "J", "img/plot.pdf": "P", "img/anim.gif": "G" },
    ),
    FAKE,
  );
  assert.equal(dec(build.files["img/anim.converted.png"]), "png:G");
  assert.equal(dec(build.files["img/photo.jpg"]), "J");
  assert.equal(build.files["img/photo.converted.png"], undefined);
  assert.match(build.mainText, /\\includegraphics\{photo\}/);
  assert.match(build.mainText, /\{plot\.pdf\}/);
  assert.equal(build.mainText.match(/img\/anim\.converted\.png/g)?.length, 2);
  assert.deepEqual(build.missing, []);
});

test("buildProject: олдоогүй болон хөрвүүлж чадаагүй зургийг тэмдэглэнэ", async () => {
  const build = await buildProject(
    source(
      "main.tex",
      {
        "main.tex": [
          "\\newcommand{\\imgdir}{figs}",
          "\\includegraphics{\\imgdir/none}",
          "\\includegraphics{broken.gif}",
          "\\includegraphics{broken.gif}",
        ].join("\n"),
      },
      { "broken.gif": "bad" },
    ),
    FAKE,
  );
  assert.deepEqual(build.missing, ["figs/none", "broken.gif"]);
  assert.equal(build.files["broken.converted.png"], undefined);
});

test("buildProject: svg багцтай үед includesvg-г PDF болгоно", async () => {
  const build = await buildProject(
    source(
      "main.tex",
      {
        "main.tex": [
          "\\usepackage{svg}",
          "\\svgpath{{fig/}}",
          "\\includesvg{chart}",
          "\\includesvg{chart}",
          "\\includesvg{gone}",
          "\\includesvg{broken}",
          "\\includegraphics{logo.svg}",
        ].join("\n"),
      },
      { "fig/chart.svg": "C", "fig/broken.svg": "bad", "logo.svg": "L" },
    ),
    FAKE,
  );
  assert.equal(dec(build.files["fig/chart.converted.pdf"]), "pdf:C");
  assert.equal(dec(build.files["logo.converted.pdf"]), "pdf:L");
  assert.equal(build.files["fig/broken.converted.pdf"], undefined);
  assert.deepEqual(build.missing, ["gone", "broken"]);
  assert.doesNotMatch(build.mainText, /\\includesvg\{chart\}/);
  assert.match(build.mainText, /fig\/chart\.converted\.pdf/);
});

test("buildProject: svg багцгүй үед includesvg-д хүрэхгүй", async () => {
  const text = "\\includesvg{chart}";
  const build = await buildProject(
    source("main.tex", { "main.tex": text }, { "chart.svg": "C" }),
    FAKE,
  );
  assert.equal(build.mainText, text);
  assert.deepEqual(build.missing, []);
});

test("buildProject: .tex биш текст файлын агуулгыг өөрчлөхгүй", async () => {
  const bib = "\\includegraphics{anim.gif}";
  const build = await buildProject(
    source(
      "main.tex",
      { "main.tex": bib, "refs.bib": bib },
      { "anim.gif": "G" },
    ),
    FAKE,
  );
  assert.equal(build.files["refs.bib"], bib);
  assert.match(build.mainText, /anim\.converted\.png/);
});
