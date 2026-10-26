import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSymbolIndex,
  mergeSymbols,
  scanSource,
} from "../src/tex/texsymbols.ts";

test("scanSource .tex файлаас шошго, ишлэл, индекс, тодорхойлолтыг цуглуулна", () => {
  const symbols = scanSource(
    "main.tex",
    [
      "\\section{А}\\label{sec:a} \\label { fig:b }",
      "% \\label{hidden}",
      "\\bibitem{knuth} \\bibitem[Л]{lamport}",
      '\\index{мод!нарс|textbf} \\index{a@\\textbf{A}} \\index{x"|y|see{z}}',
      "\\newcommand{\\R}{\\mathbb{R}} \\newcommand\\pair[2]{(#1,#2)}",
      "\\renewcommand*{\\vec}[1]{\\mathbf{#1}} \\DeclareMathOperator{\\rank}{rank}",
      "\\def\\foo{x}",
      "\\newenvironment{note}{}{} \\newenvironment{boxed}[1]{}{}",
      "\\newtheorem{lemma}{Лемм} \\newtheorem*{remark*}{Тайлбар}",
    ].join("\n"),
  );
  assert.deepEqual(symbols.label, ["sec:a", "fig:b"]);
  assert.deepEqual(symbols.cite, ["knuth", "lamport"]);
  assert.deepEqual(symbols.index, ["мод!нарс", "a@\\textbf{A}", 'x"|y']);
  assert.deepEqual(symbols.commands, [
    "R",
    "pair{#}{}",
    "vec{#}",
    "rank",
    "foo",
  ]);
  assert.deepEqual(symbols.environments, ["note", "boxed{#}", "lemma"]);
});

test("scanSource .bib файлаас зөвхөн бичлэгийн түлхүүрийг авна", () => {
  const symbols = scanSource(
    "refs.bib",
    "@string{ams = {AMS}}\n@Article{knuth84,\n title={x}}\n@book( lamport94 ,\n}\n@comment{skip,}",
  );
  assert.deepEqual(symbols.cite, ["knuth84", "lamport94"]);
  assert.deepEqual(symbols.label, []);
});

test("mergeSymbols давхардлыг хасна", () => {
  const a = scanSource("a.tex", "\\label{x}\\label{y}");
  const b = scanSource("b.tex", "\\label{y}\\label{z}");
  assert.deepEqual(mergeSymbols([a, b]).label, ["x", "y", "z"]);
});

test("createSymbolIndex өөрчлөгдсөн файлыг л дахин уншиж, хасагдсаныг мартана", () => {
  const index = createSymbolIndex();
  const big = "\\label{a}";
  const first = index.collect([
    ["a.tex", big],
    ["b.tex", "\\label{b}"],
  ]);
  assert.deepEqual(first.label, ["a", "b"]);
  const second = index.collect([
    ["a.tex", big],
    ["b.tex", "\\label{c}"],
  ]);
  assert.deepEqual(second.label, ["a", "c"]);
  assert.deepEqual(index.collect([["a.tex", big]]).label, ["a"]);
});
