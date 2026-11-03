import test from "node:test";
import assert from "node:assert/strict";

import { placeAfter, preambleEdit } from "../src/tex/texrequire.ts";
import { previewTex } from "../src/tex/latexpreview.ts";
import { preambleFor } from "../src/tex/latexpreamble.ts";

const setupFor = (text: string, inserted: string) =>
  preambleEdit(text, { from: text.length, to: text.length, text: inserted });

const doc = (head: string, type = "article"): string =>
  "\\documentclass{" + type + "}\n" + head + "\\begin{document}\n";

const added = (text: string, inserted: string): string | undefined =>
  setupFor(text, inserted)?.text;

test("preambleEdit: хэрэгтэй багцыг \\begin{document}-ийн өмнө нэмнэ", () => {
  const edit = setupFor(doc(""), "\\mathbb{R}")!;
  assert.equal(edit.text, "\\usepackage{amssymb}\n");
  assert.equal(edit.from, doc("").indexOf("\\begin{document}"));
  assert.equal(
    added(doc(""), "\\begin{align}\n\\end{align}"),
    "\\usepackage{amsmath}\n",
  );
  assert.equal(added(doc(""), "\\href{a}{b}"), "\\usepackage{hyperref}\n");
  assert.equal(
    added(doc(""), "\\printindex"),
    "\\usepackage{makeidx}\n\\makeindex\n",
  );
});

test("preambleEdit: ачаалагдсан багцыг давтахгүй, тайлбарыг тоохгүй", () => {
  const loaded = doc("\\usepackage[a]{x,amssymb}\n");
  assert.equal(setupFor(loaded, "\\mathbb{R}"), null);
  assert.equal(setupFor(doc("\\usepackage{url}\n"), "\\url{a}"), null);
  assert.equal(
    added(doc("% \\usepackage{amssymb}\n"), "\\mathbb{R}"),
    "\\usepackage{amssymb}\n",
  );
  assert.equal(setupFor(doc(""), "\\frac{a}{b}"), null);
});

test("preambleEdit: теоремын орчныг тодорхойлж, өөрийнхийг нь хөндөхгүй", () => {
  assert.equal(
    added(doc(""), "\\begin{lemma}\n\\end{lemma}"),
    "\\usepackage{amsthm}\n\\theoremstyle{plain}\n\\newtheorem{lemma}{Лемм}\n",
  );
  assert.equal(
    setupFor(
      doc("\\usepackage{amsthm}\n\\newtheorem{lemma}{Lemma}\n"),
      "\\begin{lemma}",
    ),
    null,
  );
  assert.equal(added(doc(""), "\\begin{proof}"), "\\usepackage{amsthm}\n");
});

test("preambleEdit: beamer-т байгаа зүйлийг нэмэхгүй", () => {
  const deck = doc("", "beamer");
  assert.equal(setupFor(deck, "\\mathbb{R} \\begin{lemma}"), null);
  assert.equal(
    added(deck, "\\begin{remark}"),
    "\\theoremstyle{remark}\n\\newtheorem{remark}{Тайлбар}\n",
  );
});

test("preambleEdit: бүтэн баримт биш бол преамбул хөндөхгүй", () => {
  assert.equal(setupFor("\\mathbb{R}", "\\mathbb{R}"), null);
  assert.equal(
    setupFor("\\documentclass{article}\n% \\begin{document}\n", "\\url{a}"),
    null,
  );
});

test("placeAfter: засварыг зөвхөн нэмэлтийн араас шилжүүлнэ", () => {
  const setup = setupFor(doc(""), "\\mathbb{R}")!;
  const edit = {
    from: setup.from + 5,
    to: setup.from + 5,
    text: "x",
    caret: setup.from + 6,
    closes: [setup.from + 7],
    body: setup.from + 8,
  };
  const delta = setup.text.length;
  assert.deepEqual(placeAfter(edit, setup), {
    ...edit,
    from: edit.from + delta,
    to: edit.to + delta,
    caret: edit.caret + delta,
    closes: [edit.closes[0]! + delta],
    body: edit.body + delta,
  });
  const before = { ...edit, from: 0, to: 0, caret: 1 };
  assert.equal(placeAfter(before, setup), before);
});

test("preambleFor: цэсний бүх теоремын орчинг тодорхойлно", () => {
  for (const [name, title] of [
    ["lemma", "Лемм"],
    ["example", "Жишээ"],
    ["remark", "Тайлбар"],
  ]) {
    const head = preambleFor("\\begin{" + name + "}");
    assert.ok(head.includes("\\usepackage{amsthm}"), name);
    assert.ok(head.includes("\\newtheorem{" + name + "}{" + title + "}"), name);
  }
  const own = previewTex(
    "\\usepackage{amsthm}\n\\newtheorem{lemma}{Lemma}\n\\begin{document}\n\\begin{lemma}\nа\n\\end{lemma}\n",
  );
  assert.ok(!own.includes("\\newtheorem{lemma}{Лемм}"));
});

test("preambleFor: \\chapter, \\printindex, \\eqref-д хэрэгтэйг нэмнэ", () => {
  assert.ok(preambleFor("\\chapter{а}").includes("{report}"));
  assert.ok(preambleFor("а").includes("{article}"));
  assert.ok(
    preambleFor("\\printindex").includes("\\usepackage{makeidx}\n\\makeindex"),
  );
  assert.ok(preambleFor("\\eqref{a}").includes("\\usepackage{amsmath}"));
});

test("preambleEdit: \\begin{document}-ийг хамарсан сонголтод хүрэхгүй", () => {
  const text = doc("\\usepackage{a}\n") + "бичвэр\n";
  const at = text.indexOf("\\begin{document}");
  const inserted = "\\mathbb{R}";
  const edit = (from: number, to: number) =>
    preambleEdit(text, { from, to, text: inserted });
  assert.equal(edit(at - 3, at + 3), null);
  assert.ok(edit(at - 3, at));
  assert.ok(edit(at, at + 3));
});

test("previewTex: хэрэглэгчийн amsthm байхад ч теорем тодорхойлогдоно", () => {
  const tex = previewTex(
    "\\usepackage{amsthm}\n\\begin{document}\n\\begin{theorem}\nа\n\\end{theorem}\n",
  );
  assert.ok(
    tex.indexOf("\\usepackage{amsthm}") < tex.indexOf("\\theoremstyle{plain}"),
  );
});
