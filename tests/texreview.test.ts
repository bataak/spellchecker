import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { buildProject } from "../src/tex/projectbuild.ts";
import { toBeamer, toLatexBody } from "../src/tex/latex.ts";
import { escapeTex } from "../src/tex/texescape.ts";
import { texImagePaths } from "../src/tex/teximages.ts";

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
