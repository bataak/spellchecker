import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { retryDelay } from "../src/preview/texjob.ts";
import { parseEntry } from "../src/tex/makeindex.ts";
import { buildProject } from "../src/tex/projectbuild.ts";
import { toBeamer, toLatexBody } from "../src/tex/latex.ts";
import { PdfError } from "../src/tex/texerrors.ts";
import { escapeTex } from "../src/tex/texescape.ts";
import { rewriteIncludes, texImagePaths } from "../src/tex/teximages.ts";
import { graphicRefs } from "../src/tex/texproject.ts";
import { rewriteSvg, svgRefs } from "../src/tex/texsvg.ts";

const body = (md: string): string => toLatexBody(parse(md));

const project = (tex: string, ...binaries: string[]) =>
  buildProject(
    {
      main: "main.tex",
      texts: new Map([["main.tex", tex]]),
      binaries: new Map(binaries.map((name) => [name, new Uint8Array(1)])),
    },
    {
      raster: () => Promise.resolve(new Uint8Array(1)),
      svg: () => Promise.resolve(new Uint8Array(1)),
    },
  );

test('escapeTex: " тэмдэгт babel-ийн товчлол болохгүй', () => {
  assert.equal(escapeTex('"тест"'), "\\textquotedbl{}тест\\textquotedbl{}");
  assert.ok(body('Энэ "тест" гэж').includes("\\textquotedbl{} гэж"));
});

test("хатуу мөр таслалтын дараах [ ба * аргумент болохгүй", () => {
  assert.ok(body("Нэг  \n[1] хоёр").includes("Нэг\\\\\n{}[1] хоёр"));
  assert.ok(body("Нэг  \n\\* хоёр").includes("Нэг\\\\\n{}* хоёр"));
  assert.ok(body("Нэг  \nхоёр").includes("Нэг\\\\\nхоёр"));
});

test("томьёоны доторх \\\\[ хэмжээ хэвээр үлдэнэ", () => {
  const source = "$a\\\\[2pt]b$";
  assert.ok(body(source).includes(source));
});

test("хүснэгтийн мөрийн эхний нүд [ ба * -аар эхэлбэл хамгаална", () => {
  const tex = body("| а | б |\n|---|---|\n| в | г |\n| [1] | [2] |\n");
  assert.ok(tex.includes("\n{}[1] & [2] \\\\"), tex);
  assert.ok(tex.includes("\nв & г \\\\"), tex);
});

for (const [name, md] of [
  [
    "багана",
    "## С\n\n::: {.columns}\n::: {.column}\n```\nкод\n```\n:::\n:::\n",
  ],
  ["ишлэл", "## С\n\n> ```\n> код\n> ```\n"],
  ["дээд түвшин", "## С\n\n```\nкод\n```\n"],
] as const) {
  test(`beamer: ${name} доторх код блоктой слайд fragile байна`, () => {
    assert.ok(
      toBeamer(parse(md)).includes("\\begin{frame}[fragile=singleslide]{С}"),
    );
  });
}

test("beamer: давхар давхаргатай слайдад энгийн fragile үлдэнэ", () => {
  const md =
    "## С\n\n```\nкод\n```\n\n\\begin{center}\n\\pause\n\\end{center}\n";
  assert.ok(toBeamer(parse(md)).includes("\\begin{frame}[fragile]{С}"));
});

test("beamer: код блокгүй слайд fragile биш", () => {
  assert.ok(toBeamer(parse("## С\n\nбичвэр\n")).includes("\\begin{frame}{С}"));
});

test("макроны аргументтай \\includegraphics-ийг хөндөхгүй", async () => {
  const tex = String.raw`\newcommand{\fig}[1]{\includegraphics[width=2cm]{#1}}
\foreach \f in {a,b} {\includegraphics{\f}}
\fig{a.png}`;
  const build = await project(tex, "a.png");
  assert.equal(build.mainText, tex);
  assert.deepEqual(build.missing, []);
});

test("тодорхой замтай дутуу зураг хайрцаг болж мэдэгдсээр байна", async () => {
  const build = await project(String.raw`\includegraphics{zz.png}`);
  assert.ok(build.mainText.includes("\\fbox"));
  assert.deepEqual(build.missing, ["zz.png"]);
});

test("тодорхой замтай макро задарч, файлаа олсоор байна", async () => {
  const tex = String.raw`\newcommand{\dir}{img}
\includegraphics{\dir/a.png}`;
  const build = await project(tex, "img/a.png");
  assert.equal(build.mainText, tex);
  assert.deepEqual(build.missing, []);
});

test("texImagePaths: #1 ба задлагдаагүй макро зураг гэж тоологдохгүй", () => {
  const tex = String.raw`\newcommand{\fig}[1]{\includegraphics{#1}}
\includegraphics{\f}
\includegraphics{a.png}`;
  assert.deepEqual(texImagePaths(tex), ["a.png"]);
});

test('makeIndex: \\" ба \\\\ -г makeindex-тэй ижил уншина', () => {
  const entry = (key: string) => parseEntry(key, "1")!.levels;
  assert.equal(entry('M\\"obius')[0].text, 'M\\"obius');
  assert.equal(entry('g"!h')[0].text, "g!h");
  assert.equal(entry('i""j')[0].text, 'i"j');
  assert.equal(entry('k\\\\"!l')[0].text, "k\\\\!l");
  assert.equal(entry('m"\\n')[0].text, "m\\n");
  assert.deepEqual(
    entry('p\\"!q').map((level) => level.text),
    ['p\\"', "q"],
  );
  assert.deepEqual(
    entry("a\\!b").map((level) => level.text),
    ["a\\", "b"],
  );
  assert.equal(entry('Erd\\"os@Erd\\H{o}s')[0].sort, 'Erd\\"os');
});

const LITERAL = String.raw`\begin{verbatim}
\includegraphics{a.png}
\includesvg{b}
\end{verbatim}
\verb|\includegraphics{c.png}|
% \includegraphics{d.png}
\begin{Verbatim}
\includegraphics{e.png}
\end{Verbatim}
\includegraphics{f.png}`;

test("verbatim, \\verb, тайлбар доторх зургийг бодит зураг гэж үзэхгүй", async () => {
  assert.deepEqual(graphicRefs(LITERAL), ["f.png"]);
  assert.deepEqual(texImagePaths(LITERAL), ["f.png"]);
  assert.deepEqual(svgRefs(LITERAL), []);
  const build = await project(LITERAL);
  assert.deepEqual(build.missing, ["f.png"]);
  assert.ok(build.mainText.includes("\\verb|\\includegraphics{c.png}|"));
  assert.ok(build.mainText.includes("\\includesvg{b}"));
  assert.equal(build.mainText.split("\\fbox").length, 2);
  assert.equal(rewriteIncludes(LITERAL, new Map()).split("\\fbox").length, 2);
  assert.equal(
    rewriteSvg("\\usepackage{svg}\n" + LITERAL, () => null).split("\\fbox")
      .length,
    1,
  );
});

test("verbatim-ийн гаднах зураг бичвэрийн дотор солигдсоор байна", () => {
  const out = rewriteIncludes(LITERAL, new Map([["f.png", "image1.png"]]));
  assert.ok(out.endsWith("\\includegraphics{image1.png}"));
});

test("retryDelay: LaTeX-ийн алдааг дахин оролдохгүй", () => {
  assert.equal(retryDelay(new PdfError("! Undefined"), 0), undefined);
  assert.equal(retryDelay(new PdfError("Engine crashed", true), 0), 2000);
  assert.equal(retryDelay(new Error("Failed to fetch"), 1), 5000);
  assert.equal(retryDelay(new Error("Failed to fetch"), 3), undefined);
});
