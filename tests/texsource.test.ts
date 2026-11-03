import test from "node:test";
import assert from "node:assert/strict";

import { toPdfLatex } from "../src/tex/texcompat.ts";
import { graphicsPaths, referencesFiles } from "../src/tex/texproject.ts";
import { TexSource } from "../src/tex/texsource.ts";
import { usesSvgPackage } from "../src/tex/texsvg.ts";
import { createSymbolIndex } from "../src/tex/texsymbols.ts";
import { sourceWords } from "../src/tex/texsync.ts";

const VERBATIM = "\\begin{verbatim}\n\\label{v} % б\n\\end{verbatim}\n";

test("of: нэг текстийг дахин задлахгүй", () => {
  const text = "a % б\n";
  assert.equal(TexSource.of(text), TexSource.of("a % б\n"));
  assert.notEqual(TexSource.of(text), TexSource.of("c\n"));
});

test("isLiteral: тайлбар ба verbatim-ийг таньж, тушаалыг ялгана", () => {
  const text = "x % y\n" + VERBATIM + "\\verb|z| w";
  const source = TexSource.of(text);
  assert.equal(source.isLiteral(text.indexOf("x")), false);
  assert.equal(source.isLiteral(text.indexOf("%")), true);
  assert.equal(source.isLiteral(text.indexOf("\\label")), true);
  assert.equal(source.isLiteral(text.indexOf("z")), true);
  assert.equal(source.isLiteral(text.indexOf("w")), false);
});

test("inComment: зөвхөн % тэмдгийн дараа, мөрийн төгсгөл хүртэл", () => {
  const text = "ab % cd\nef";
  const source = TexSource.of(text);
  assert.equal(source.inComment(text.indexOf("%")), false);
  assert.equal(source.inComment(text.indexOf("%") + 1), true);
  assert.equal(source.inComment(text.indexOf("\n")), true);
  assert.equal(source.inComment(text.indexOf("e")), false);
  assert.equal(source.inComment(0), false);
});

test("inComment: \\% ба код доторх % тайлбар биш", () => {
  for (const text of ["50\\% x", "\\\\\\% x", "\\verb|%| x"]) {
    assert.equal(TexSource.of(text).inComment(text.length), false, text);
  }
  assert.equal(TexSource.of("\\\\% x").inComment(5), true);
});

test("insideCode: хаагдаагүй код ба хил дээрх байрлал", () => {
  const open = "\\begin{verbatim}\n";
  assert.equal(TexSource.of(open).insideCode(open.length), true);
  const closed = "\\verb|ab| c";
  assert.equal(TexSource.of(closed).insideCode(closed.length), false);
});

test("insideCode: бичиж буй \\verb-ийг код гэж таньж, дууссаныг нь үгүйсгэнэ", () => {
  const inside = (text: string): boolean =>
    TexSource.of(text).insideCode(text.length);
  assert.equal(inside("\\verb|ab "), true);
  assert.equal(inside("\\verb*+ab "), true);
  assert.equal(inside("\\verb|a| \\verb|b "), true);
  assert.equal(inside("\\verb|a| "), false);
  assert.equal(inside("\\\\verb|a "), false);
  assert.equal(inside("\\verb|a\nb "), false);
});

test("matches, replace: тайлбар, verbatim-ийг алгасна", () => {
  const text =
    "\\a{1} % \\a{2}\n" + "\\begin{verbatim}\n\\a{3}\n\\end{verbatim}\n\\a{4}";
  const source = TexSource.of(text);
  const pattern = /\\a\{(\d)\}/g;
  assert.deepEqual(
    source.matches(pattern).map((match) => match[1]),
    ["1", "4"],
  );
  assert.equal(
    source.replace(pattern, (_, digit) => "<" + digit + ">"),
    "<1> % \\a{2}\n\\begin{verbatim}\n\\a{3}\n\\end{verbatim}\n<4>",
  );
});

test("live: тайлбар, кодын агуулгыг хасаж, мөр, тушаалыг үлдээнэ", () => {
  assert.equal(TexSource.of("a % б\nc").live(), "a \nc");
  assert.equal(TexSource.of("50\\% c").live(), "50\\% c");
  assert.equal(
    TexSource.of(VERBATIM + "d").live(),
    "\\begin{verbatim}\\end{verbatim}\nd",
  );
  assert.equal(TexSource.of("\\verb|%x| y").live(), "\\verb|| y");
});

test("blankedComments: байрлалыг хадгалж, кодыг хэвээр үлдээнэ", () => {
  const text = "a % б\n\\verb|%| c";
  const blanked = TexSource.of(text).blankedComments();
  assert.equal(blanked, "a    \n\\verb|%| c");
  assert.equal(blanked.length, text.length);
});

test("documentStart: тайлбар, verbatim доторхыг тооцохгүй", () => {
  const text =
    "% \\begin{document}\n\\begin{verbatim}\n\\begin{document}\n\\end{verbatim}\n\\begin{document}";
  assert.equal(
    TexSource.of(text).documentStart()?.index,
    text.lastIndexOf("\\begin{document}"),
  );
  assert.equal(TexSource.of("a").documentStart(), undefined);
});

test("documentClass: тайлбар, verbatim доторхыг тооцохгүй", () => {
  assert.equal(
    TexSource.of(
      "% \\documentclass{a}\n\\begin{verbatim}\n\\documentclass{b}\n\\end{verbatim}\n\\documentclass[12pt]{ c }",
    ).documentClass(),
    "c",
  );
  assert.equal(TexSource.of("x").documentClass(), null);
});

test("packages: сонголттой, сонголтгүй багцыг ялгана", () => {
  const source = TexSource.of(
    "\\usepackage{a, b}\n\\RequirePackage[x]{c}\n% \\usepackage{d}\n\\begin{verbatim}\n\\usepackage{e}\n\\end{verbatim}\n",
  );
  assert.deepEqual([...source.packages()], ["a", "b", "c"]);
  assert.deepEqual([...source.configuredPackages()], ["c"]);
});

test("дуудагчид: verbatim доторх тушаалыг амьд гэж үзэхгүй", () => {
  const fenced = (body: string): string =>
    "\\begin{verbatim}\n" + body + "\n\\end{verbatim}\n";
  const symbols = createSymbolIndex().collect([
    ["a.tex", fenced("\\label{код}") + "\\label{жинхэнэ}"],
  ]);
  assert.deepEqual(symbols.label, ["жинхэнэ"]);
  assert.equal(referencesFiles(fenced("\\input{x}")), false);
  assert.equal(referencesFiles("\\input{x}"), true);
  assert.deepEqual(graphicsPaths(fenced("\\graphicspath{{a/}}")), []);
  assert.equal(usesSvgPackage([fenced("\\usepackage{svg}")]), false);
  assert.equal(usesSvgPackage(["\\usepackage{svg}"]), true);
});

test("toPdfLatex: filecontents доторх XeTeX тушаалыг хөрвүүлэхгүй", () => {
  const inner = "\\setmainfont{Arial}";
  const tex =
    "\\begin{filecontents}{a.sty}\n" +
    inner +
    "\n\\end{filecontents}\n\\documentclass{article}\n\\begin{document}\nа\n\\end{document}\n";
  assert.ok(toPdfLatex(tex).includes(inner));
});

test("sourceWords: \\verb доторх % дараах үгийг алгасахгүй", () => {
  const words = sourceWords("\\verb|%| сайн % тайлбар\nүг").map(
    (item) => item.word,
  );
  assert.ok(words.includes("сайн"));
  assert.ok(words.includes("үг"));
  assert.ok(!words.includes("тайлбар"));
});
