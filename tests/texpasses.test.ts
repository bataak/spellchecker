import { test } from "node:test";
import assert from "node:assert/strict";
import { planPasses } from "../src/tex/texpasses.ts";

const passes = (...sources: string[]): number => planPasses(sources).passes;

test("planPasses: ном зүйд 3, холбоост 2 удаа хөрвүүлнэ", () => {
  assert.equal(passes("Энгийн бичвэр"), 1);
  assert.equal(passes("\\label{x}", "\\ref{x}"), 2);
  assert.equal(passes("\\bibliography{refs}"), 3);
  assert.equal(passes("\\bibliography{refs}", "\\cite{a}"), 3);
  assert.equal(passes("% \\bibliography{refs}"), 1);
  assert.equal(passes(String.raw`x\\%\ref{a}`), 1);
});

test("planPasses: индексийн алхам холбоосын давталт дээр нэмэгдэнэ", () => {
  const index = planPasses(["\\makeindex"]);
  assert.equal(index.passes, 2);
  assert.equal(index.steps.length, 1);
  assert.equal(passes("\\makeindex", "\\tableofcontents"), 3);
  assert.equal(passes("\\makeindex\\addbibresource{a.bib}"), 4);
  assert.deepEqual(planPasses(["\\ref{a}"]).steps, []);
});
