import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTree,
  cleanPath,
  commonRoot,
  compilePasses,
  expandMacros,
  findMain,
  graphicRefs,
  graphicsPaths,
  isLatexDocument,
  masterPath,
  mapGraphics,
  movedPath,
  parentDirs,
  pathMacros,
  referencesFiles,
  resolveGraphic,
  rootedPath,
  skippedPath,
  texMaster,
  validName,
  viewableType,
} from "../src/texproject.ts";

test("cleanPath: цэг, давхар зураас, .. замыг цэгцэлнэ", () => {
  assert.equal(cleanPath("./a//b/./c.tex"), "a/b/c.tex");
  assert.equal(cleanPath("a/b/../c.tex"), "a/c.tex");
  assert.equal(cleanPath("a\\b.tex"), "a/b.tex");
  assert.equal(cleanPath("../x.tex"), null);
  assert.equal(cleanPath("./"), null);
});

test("skippedPath: далд хавтас, build гаралтыг алгасна", () => {
  assert.equal(skippedPath(".git/config"), true);
  assert.equal(skippedPath("__MACOSX/main.tex"), true);
  assert.equal(skippedPath("main.aux"), true);
  assert.equal(skippedPath("out/main.synctex.gz"), true);
  assert.equal(skippedPath("main.tex"), false);
  assert.equal(skippedPath("img/fig.pdf"), false);
});

test("commonRoot: zip-ийн нийтлэг дээд хавтсыг олно", () => {
  assert.equal(commonRoot(["p/main.tex", "p/img/a.png"]), "p");
  assert.equal(commonRoot(["main.tex", "img/a.png"]), "");
  assert.equal(commonRoot(["p/main.tex", "q/x.tex"]), "");
  assert.equal(rootedPath("p/img/a.png", "p"), "img/a.png");
  assert.equal(rootedPath("other/a.png", "p"), "other/a.png");
});

test("findMain: \\documentclass-тай, \\begin{document}-тэй файлыг сонгоно", () => {
  const texts = new Map([
    ["chapters/intro.tex", "\\section{Оршил}"],
    ["old/draft.tex", "\\documentclass{article}"],
    [
      "thesis.tex",
      "\\documentclass{report}\n\\begin{document}\n\\end{document}",
    ],
    ["refs.bib", "@book{a,}"],
  ]);
  assert.equal(findMain(texts), "thesis.tex");
});

test("findMain: тайлбарласан \\documentclass-ыг тооцохгүй, main.tex-ийг илүүд үзнэ", () => {
  assert.equal(
    findMain(new Map([["a.tex", "% \\documentclass{article}"]])),
    null,
  );
  const both = "\\documentclass{article}\\begin{document}\\end{document}";
  assert.equal(
    findMain(
      new Map([
        ["b.tex", both],
        ["main.tex", both],
      ]),
    ),
    "main.tex",
  );
});

test("graphicsPaths ба resolveGraphic: өргөтгөлгүй, \\graphicspath-тай зургийг олно", () => {
  const files = new Set(["img/pic.png", "fig/plot.pdf", "logo.jpg"]);
  const has = (path: string): boolean => files.has(path);
  const search = graphicsPaths("\\graphicspath{{img/}{fig/}}");
  assert.deepEqual(search, ["img/", "fig/"]);
  assert.equal(resolveGraphic("pic", "", search, has), "img/pic.png");
  assert.equal(resolveGraphic("plot", "", search, has), "fig/plot.pdf");
  assert.equal(resolveGraphic("./logo.jpg", "", search, has), "logo.jpg");
  assert.equal(resolveGraphic("none", "", search, has), null);
});

test("resolveGraphic: үндсэн файлын хавтсаас эхэлж хайна", () => {
  const files = new Set(["src/img/a.png", "shared/b.png"]);
  const has = (path: string): boolean => files.has(path);
  assert.equal(resolveGraphic("img/a", "src", [], has), "src/img/a.png");
  assert.equal(
    resolveGraphic("../shared/b.png", "src", [], has),
    "shared/b.png",
  );
});

test("mapGraphics: олдоогүй зургийг хүрээгээр, хөрвүүлсэн зургийг шинэ нэрээр солино", () => {
  const text =
    "\\includegraphics[width=1cm]{a}\n\\includegraphics{b.webp}\n\\includegraphics{c}";
  const out = mapGraphics(text, (raw) =>
    raw === "a" ? "a" : raw === "b.webp" ? "b.converted.png" : null,
  );
  assert.equal(
    out,
    "\\includegraphics[width=1cm]{a}\n\\includegraphics{b.converted.png}\n" +
      "\\fbox{\\ttfamily\\detokenize{c}}",
  );
});

test("graphicRefs: тайлбар доторх зургийг алгасна", () => {
  assert.deepEqual(
    graphicRefs("\\includegraphics{a}\n% \\includegraphics{b}"),
    ["a"],
  );
});

test("compilePasses: ном зүйд 3, холбоост 2 удаа хөрвүүлнэ", () => {
  assert.equal(compilePasses(["Энгийн бичвэр"]), 1);
  assert.equal(compilePasses(["\\label{x}", "\\ref{x}"]), 2);
  assert.equal(compilePasses(["\\bibliography{refs}"]), 3);
  assert.equal(compilePasses(["% \\bibliography{refs}"]), 1);
});

test("movedPath ба parentDirs: нэр солих замыг тооцно", () => {
  assert.equal(movedPath("ch/a.tex", "ch", "chapters"), "chapters/a.tex");
  assert.equal(movedPath("ch", "ch", "chapters"), "chapters");
  assert.equal(movedPath("chx/a.tex", "ch", "chapters"), null);
  assert.deepEqual(parentDirs("a/b/c.tex"), ["a", "a/b"]);
});

test("validName: хориотой тэмдэгтийг шүүнэ", () => {
  assert.equal(validName("бүлэг 1.tex"), true);
  assert.equal(validName("a/b"), false);
  assert.equal(validName(".."), false);
  assert.equal(validName("  "), false);
});

test("buildTree: хавтсыг эхэнд, нэрээр эрэмбэлнэ", () => {
  const tree = buildTree(
    ["main.tex", "ch/b.tex", "ch/a.tex", "abc.bib"],
    ["empty"],
  );
  assert.deepEqual(
    tree.map((node) => node.path),
    ["ch", "empty", "abc.bib", "main.tex"],
  );
  assert.deepEqual(
    tree[0]!.children.map((node) => node.path),
    ["ch/a.tex", "ch/b.tex"],
  );
});

test("referencesFiles: өөр файл ашигладаг эсэхийг тодорхойлно", () => {
  assert.equal(referencesFiles("\\input{chapters/intro}"), true);
  assert.equal(referencesFiles("\\include{ch1}"), true);
  assert.equal(
    referencesFiles("\\includegraphics[width=3cm]{img/a.png}"),
    true,
  );
  assert.equal(referencesFiles("\\bibliography{refs}"), true);
  assert.equal(referencesFiles("\\addbibresource{refs.bib}"), true);
  assert.equal(referencesFiles("% \\input{old}\nЭнгийн бичвэр"), false);
  assert.equal(referencesFiles("\\inputencoding{utf8}"), false);
  assert.equal(
    referencesFiles(
      "\\documentclass{article}\n\\begin{document}Сайн\\end{document}",
    ),
    false,
  );
});

test("isLatexDocument: зөвхөн \\documentclass, \\begin{document} хоёулаа байвал", () => {
  assert.equal(
    isLatexDocument(
      "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}",
    ),
    true,
  );
  assert.equal(isLatexDocument("Энгийн бичвэр, өргөтгөл нь .tex"), false);
  assert.equal(isLatexDocument("\\documentclass{article}"), false);
  assert.equal(isLatexDocument("\\section{Оршил}\n\\input{a}"), false);
  assert.equal(
    isLatexDocument("% \\documentclass{article}\n\\begin{document}"),
    false,
  );
});

test("findMain: энгийн бичвэртэй .tex файлыг үндсэн гэж үзэхгүй", () => {
  assert.equal(
    findMain(
      new Map([
        ["notes.tex", "Энгийн тэмдэглэл"],
        ["half.tex", "\\documentclass{article}"],
      ]),
    ),
    null,
  );
});

test("texMaster ба masterPath: AUCTeX-ийн TeX-master мөрийг уншина", () => {
  const sub =
    "\\section{Оршил}\n\n%%% Local Variables:\n%%% mode: LaTeX\n" +
    '%%% TeX-master: "../F.CSA304_Lecture"\n%%% End:\n';
  assert.equal(texMaster(sub), "../F.CSA304_Lecture");
  assert.equal(texMaster("%%% TeX-master: t\n"), null);
  assert.equal(texMaster("Энгийн бичвэр"), null);
  assert.equal(
    masterPath("chapters/intro.tex", "../F.CSA304_Lecture"),
    "F.CSA304_Lecture.tex",
  );
  assert.equal(masterPath("a.tex", "main.ltx"), "main.ltx");
  assert.equal(masterPath("a.tex", "../../x"), null);
});

test("findMain: TeX-master заасан файлыг илүүд үзнэ", () => {
  const doc = "\\documentclass{article}\\begin{document}\\end{document}";
  assert.equal(
    findMain(
      new Map([
        ["main.tex", doc],
        ["F.CSA304_Lecture.tex", doc],
        ["chapters/one.tex", '%%% TeX-master: "../F.CSA304_Lecture"\n'],
      ]),
    ),
    "F.CSA304_Lecture.tex",
  );
});

test("viewableType: PDF ба зургийн төрлийг өгнө", () => {
  assert.equal(viewableType("img/fig.PDF"), "application/pdf");
  assert.equal(viewableType("a/b.jpg"), "image/jpeg");
  assert.equal(viewableType("logo.svg"), "image/svg+xml");
  assert.equal(viewableType("main.tex"), null);
  assert.equal(viewableType("font.pfb"), null);
});

test("pathMacros ба expandMacros: \\def, \\newcommand-оор өгсөн замыг задална", () => {
  const macros = pathMacros([
    String.raw`\newcommand{\Logo}{\Base/logo}
\def\Base{img}
% \def\Base{old}
\newcommand{\Two}[1]{#1}`,
  ]);
  assert.equal(expandMacros(String.raw`\Logo`, macros), "img/logo");
  assert.equal(macros.has("Two"), false);
  assert.equal(expandMacros(String.raw`\Unknown`, macros), String.raw`\Unknown`);
});
