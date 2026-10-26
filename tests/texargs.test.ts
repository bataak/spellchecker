import { test } from "node:test";
import assert from "node:assert/strict";
import { argContext } from "../src/tex/texargs.ts";

function at(marked: string) {
  const caret = marked.indexOf("|");
  return argContext(marked.replace("|", ""), caret);
}

test("argContext шошго, ишлэл, индексийн аргументийг таньна", () => {
  assert.deepEqual(at("Зураг \\ref{fig|"), {
    kind: "arg",
    source: "label",
    from: 11,
    prefix: "fig",
  });
  assert.deepEqual(at("\\cite[х.~5]{knuth, la|"), {
    kind: "arg",
    source: "cite",
    from: 19,
    prefix: "la",
  });
  assert.equal(at("\\cref{a,|")?.prefix, "");
  assert.equal(at("\\eqref{a,|")?.prefix, "a,");
  assert.deepEqual(at("\\index{мод, ой|"), {
    kind: "arg",
    source: "index",
    from: 7,
    prefix: "мод, ой",
  });
});

test("argContext өөр команд, хаагдсан эсвэл escape хийсэн хаалтыг алгасна", () => {
  for (const marked of [
    "\\textbf{a|",
    "\\ref{a} |",
    "\\\\ref{a|",
    "\\ref{a\nb|",
    "\\index{a{b|",
  ])
    assert.equal(at(marked), null, marked);
  assert.equal(at("x\\\\\\ref{a|")?.source, "label");
});
