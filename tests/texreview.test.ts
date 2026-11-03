import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { retryDelay } from "../src/preview/texjob.ts";
import { parseEntry } from "../src/tex/makeindex.ts";
import { buildProject } from "../src/tex/projectbuild.ts";
import {
  previewTex,
  toBeamer,
  toLatexBody,
  withParatype,
} from "../src/tex/latex.ts";
import { preambleFor } from "../src/tex/latexpreamble.ts";
import { singleSlideFrames } from "../src/tex/texbeamer.ts";
import { toPdfLatex } from "../src/tex/texcompat.ts";
import { PdfError } from "../src/tex/texerrors.ts";
import { escapeTex } from "../src/tex/texescape.ts";
import { rewriteIncludes, texImagePaths } from "../src/tex/teximages.ts";
import { graphicRefs } from "../src/tex/texproject.ts";
import { rewriteSvg, svgRefs } from "../src/tex/texsvg.ts";
import { sourceWords } from "../src/tex/texsync.ts";

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

test("жагсаалт доторх дугаартай жагсаалт өөрийн тоолуурыг ашиглана", () => {
  const nested = body("- нэг\n  5. тав\n  6. зургаа\n- хоёр\n");
  assert.ok(nested.includes("\\setcounter{enumi}{4}"), nested);
  const ordered = body("3. гурав\n   7. долоо\n");
  assert.ok(ordered.includes("\\setcounter{enumi}{2}"), ordered);
  assert.ok(ordered.includes("\\setcounter{enumii}{6}"), ordered);
  const mixed = body("2. а\n   - б\n     9. в\n");
  assert.ok(mixed.includes("\\setcounter{enumii}{8}"), mixed);
});

test("кирилл бичвэртэй fragile слайдыг singleslide болгож, бусдыг хөндөхгүй", () => {
  const frame = (options: string, body: string): string =>
    "\\begin{frame}[" + options + "]\n" + body + "\n\\end{frame}";
  const code = "\\begin{verbatim}\nкод\n\\end{verbatim}";
  assert.equal(
    singleSlideFrames(frame("t, fragile", code)),
    frame("t,fragile=singleslide", code),
  );
  for (const same of [
    frame("fragile", "\\begin{verbatim}\ncode\n\\end{verbatim}"),
    frame("fragile,allowframebreaks", code),
    frame("<+->,fragile", code),
    frame("fragile", code + "\n\\pause б"),
    frame("fragile", code + "\n\\item<2> б"),
    frame("t", code),
    "% " + frame("fragile", "код"),
  ])
    assert.equal(singleSlideFrames(same), same);
  const literalPause = "\\begin{verbatim}\n\\pause код\n\\end{verbatim}";
  assert.equal(
    singleSlideFrames(frame("fragile", literalPause)),
    frame("fragile=singleslide", literalPause),
  );
});

test("төслийн оруулсан .tex файлын fragile слайд ч singleslide болно", async () => {
  const included = String.raw`\begin{frame}[fragile]
код
\end{frame}`;
  const build = await buildProject({
    main: "main.tex",
    texts: new Map([
      ["main.tex", String.raw`\input{s}`],
      ["s.tex", included],
      ["n.txt", included],
    ]),
    binaries: new Map(),
  });
  assert.match(String(build.files["s.tex"]), /fragile=singleslide/);
  assert.equal(build.files["n.txt"], included);
});

test("beamer: тэмдэглэл доторх код verbatim биш", () => {
  const md =
    "## С\n\nбичвэр\n\n::: notes\n```\n  код_1\n```\n\n\\begin{verbatim}\nx\n\\end{verbatim}\n:::\n";
  const tex = toBeamer(parse(md));
  const note = tex.slice(tex.indexOf("\\note{"));
  assert.ok(!note.includes("\\begin{verbatim}"));
  assert.ok(note.includes("\\texttt{~~код\\_1}"), note);
  assert.ok(note.includes("\\texttt{x}"), note);
  assert.ok(tex.includes("\\begin{frame}{С}"));
  const tilde = toBeamer(parse("## С\n\n::: notes\n```\na~b_c\n```\n:::\n"));
  assert.ok(tilde.includes("\\texttt{a" + escapeTex("~") + "b\\_c}"), tilde);
});

test("preview: тайлбарласан \\documentclass-тай файлыг хэсэг гэж ороож хөрвүүлнэ", () => {
  const out = previewTex(
    "%\\documentclass{article}\n%\\begin{document}\nБичвэр\n%\\end{document}\n",
  );
  assert.ok(out.startsWith("\\documentclass[12pt,a4paper]{article}"), out);
  const begin = out.indexOf("\n\\begin{document}");
  assert.ok(begin > 0 && begin < out.indexOf("Бичвэр"), out);
  assert.ok(out.trimEnd().endsWith("\n\\end{document}"), out);
});

test("preview: тайлбарласан \\begin{document} бичвэрийг преамбул уруу зөөхгүй", () => {
  const out = previewTex("Эхний\n%\\begin{document}\nХоёр\n");
  const begin = out.indexOf("\n\\begin{document}");
  assert.ok(begin < out.indexOf("Эхний"), out);
  assert.ok(begin < out.indexOf("Хоёр"), out);
});

test("preview: тайлбар дахь \\end{document} дараах бичвэрийг таслахгүй", () => {
  const out = previewTex(
    "\\begin{document}\nНэг\n%\\end{document}\nХоёр\n\\end{document}\nгуч\n",
  );
  assert.ok(out.includes("Хоёр"), out);
  assert.ok(!out.includes("гуч"), out);
});

test("preview: verbatim доторх \\usepackage мөр байрандаа үлдэнэ", () => {
  const out = previewTex(
    "\\usepackage{xcolor}\n\\begin{verbatim}\n\\usepackage{amsmath}\n\\end{verbatim}\n",
  );
  const begin = out.indexOf("\n\\begin{document}");
  assert.ok(out.indexOf("\\usepackage{xcolor}") < begin, out);
  assert.ok(out.indexOf("\\usepackage{amsmath}") > begin, out);
});

test("preview: хэрэглэгчийн ачаалсан багцыг сонголтгүй давтахгүй", () => {
  const link = previewTex("\\usepackage[colorlinks]{hyperref}\n\\href{a}{б}\n");
  assert.ok(!link.includes("\\usepackage{hyperref}"), link);
  assert.ok(link.includes("\\usepackage[colorlinks]{hyperref}"), link);
  const math = previewTex("\\usepackage[fleqn]{amsmath}\n$x$\n");
  assert.ok(!math.includes("\\usepackage{amsmath}"), math);
  const language = previewTex("\\usepackage[russian]{babel}\nа\n");
  assert.ok(!language.includes("[mongolian]{babel}"), language);
  const listed = previewTex("\\usepackage[fleqn]{amsmath,amssymb}\n$x$\n");
  assert.ok(!listed.includes("\\usepackage{amsmath}"), listed);
  assert.ok(!listed.includes("\\usepackage{amssymb}"), listed);
  const twice = previewTex(
    "\\usepackage{makeidx}\n\\makeindex\n\\printindex\n",
  );
  assert.equal(twice.split("\\usepackage{makeidx}").length, 2, twice);
  const index = previewTex(
    "\\usepackage{imakeidx}\n\\makeindex\n\\printindex\n",
  );
  assert.ok(!index.includes("{makeidx}"), index);
});

test("preview: тайлбарласан багц ачаалагдсанд тооцогдохгүй", () => {
  const head = preambleFor("%\\usepackage{hyperref}\n\\href{a}{б}\n");
  assert.ok(head.includes("\\usepackage{hyperref}"), head);
  const shown = preambleFor(
    "\\begin{verbatim}\n\\usepackage{graphicx}\n\\end{verbatim}\n\\includegraphics{a}",
  );
  assert.ok(shown.includes("\\usepackage{graphicx}"), shown);
  const index = preambleFor("%\\usepackage{makeidx}\n\\printindex");
  assert.ok(index.includes("\\usepackage{makeidx}\n\\makeindex"), index);
});

test("preamble: alignat-д amsmath нэмнэ", () => {
  const head = preambleFor("\\begin{alignat}{2}\nx &= 1\n\\end{alignat}");
  assert.ok(head.includes("\\usepackage{amsmath}"), head);
});

test("toPdfLatex: T2A-г тайлбарласан анги биш жинхэнэ ангийн дараа нэмнэ", () => {
  const out = toPdfLatex(
    "%\\documentclass{report}\n\\documentclass{article}\n\\begin{document}\nМонгол\n\\end{document}\n",
  );
  const live = out.indexOf("\n\\documentclass");
  assert.ok(live > 0 && live < out.indexOf("\\usepackage[T2A]{fontenc}"), out);
});

test("toPdfLatex: тайлбарласан T2A-г ачаалагдсанд тооцохгүй", () => {
  const out = toPdfLatex(
    "\\documentclass{article}\n%\\usepackage[T2A]{fontenc}\n\\begin{document}\nМонгол\n\\end{document}\n",
  );
  assert.ok(/^\\usepackage\[T2A\]\{fontenc\}$/m.test(out), out);
});

test("toPdfLatex: тайлбарласан \\begin{document}-ийн дараах преамбулыг хөрвүүлнэ", () => {
  const out = toPdfLatex(
    "\\documentclass{article}\n%\\begin{document}\n\\usepackage{fontspec}\n\\begin{document}\nМонгол\n\\end{document}\n",
  );
  assert.ok(!out.includes("{fontspec}"), out);
  assert.ok(out.includes("\\usepackage{paratype}"), out);
});

test("toPdfLatex: тайлбарласан XeLaTeX тохиргоо үсгийн хэвийг солихгүй", () => {
  const tex =
    "\\documentclass[a4paper]{article}\n\\usepackage[T2A]{fontenc}\n%\\usepackage{fontspec}\n%\\setmainfont{Arial}\n\\begin{document}\nМонгол\n\\end{document}\n";
  assert.equal(toPdfLatex(tex), tex);
});

test("withParatype: тайлбарыг алгасна", () => {
  const head = "\\documentclass{article}\n\\usepackage[T2A]{fontenc}\n";
  const font = withParatype(
    head + "%\\usepackage{lmodern}\n\\begin{document}\nа\n\\end{document}\n",
  );
  assert.ok(font?.includes("\n\\usepackage{paratype}\n"), String(font));
  const begin = withParatype(
    head + "%\\begin{document}\n\\begin{document}\nа\n\\end{document}\n",
  );
  assert.equal(begin?.split("\n\\begin{document}").length, 2, String(begin));
  assert.ok(begin?.includes("\n\\usepackage{paratype}\n"), String(begin));
  assert.equal(
    withParatype("%\\usepackage[T2A]{fontenc}\n\\begin{document}\n"),
    null,
  );
});

test("sync: \\\\%-ийн дараах тайлбарын үгийг тоолохгүй, байрлалыг хадгална", () => {
  const words = sourceWords("аа\\\\% нууц\nбб 100\\% вв");
  assert.deepEqual(
    words.map((word) => word.word),
    ["аа", "бб", "100", "вв"],
  );
  assert.equal(words[1]!.at, "аа\\\\% нууц\n".length);
});
