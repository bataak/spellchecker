import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<div id="backdrop"></div>');
const { createBackdrop } = await import("../src/editor/backdrop.ts");
const { texSpans } = await import("../src/tex/texhighlight.ts");

test.after(() => dom.close());

const token = (text: string, word: string) => {
  const start = text.indexOf(word);
  return { word, start, end: start + word.length };
};

function fresh() {
  const root = document.querySelector<HTMLElement>("#backdrop")!;
  const backdrop = createBackdrop(root);
  return { root, backdrop };
}

test("backdrop: мөр бүрийг блок болгож, мөрийн тоог тоолно", () => {
  const { root, backdrop } = fresh();
  backdrop.render("нэг\nхоёр\nгурав", []);
  assert.equal(backdrop.lineCount(), 3);
  assert.equal(root.querySelectorAll(".bl").length, 3);
  assert.equal(root.textContent?.replace(/\u200b/g, ""), "нэгхоёргурав");
});

test("backdrop: алдааг mark болгож, эхлэлээр нь олно", () => {
  const { root, backdrop } = fresh();
  const text = "сайн байна уу\nалдаатай үг";
  backdrop.render(text, [token(text, "байна"), token(text, "алдаатай")]);
  const marks = [...root.querySelectorAll<HTMLElement>("mark[data-start]")];
  assert.deepEqual(
    marks.map((mark) => mark.textContent),
    ["байна", "алдаатай"],
  );
  assert.equal(
    backdrop.markAt(text.indexOf("алдаатай"))?.textContent,
    "алдаатай",
  );
  assert.equal(backdrop.markAt(0), null);
  backdrop.render(text, []);
  assert.equal(root.querySelectorAll("mark").length, 0);
});

test("backdrop: идэвхтэй мөрийг тэмдэглэж, дахин зурахад хадгална", () => {
  const { root, backdrop } = fresh();
  backdrop.render("а\nб\nв", []);
  backdrop.setActiveLine(1);
  const active = () =>
    [...root.querySelectorAll<HTMLElement>(".bl")].findIndex(
      (line) => line.dataset.active === "true",
    );
  assert.equal(active(), 1);
  backdrop.render("а\nб\nв\nг", []);
  assert.equal(active(), 1);
  backdrop.setActiveLine(3);
  assert.equal(root.querySelectorAll('[data-active="true"]').length, 1);
});

test("backdrop: блокгүй горимд мөр хуваахгүй", () => {
  const { root, backdrop } = fresh();
  backdrop.setLineBlocks(false);
  backdrop.render("а\nб", []);
  assert.equal(root.querySelectorAll(".bl").length, 0);
  assert.equal(backdrop.lineCount(), 2);
});

test("backdrop: TeX өнгөлгөөг тохируулж, буцааж авахад арилгана", () => {
  const { root, backdrop } = fresh();
  const text = "\\section{А} $x$";
  backdrop.setHighlighter(texSpans);
  backdrop.render(text, []);
  assert.ok(root.querySelector(".tx-cmd"));
  assert.ok(root.querySelector(".tx-math"));
  backdrop.setHighlighter(null);
  backdrop.render(text, []);
  assert.equal(root.querySelector("[class^=tx-]"), null);
});

test("backdrop: мөрийн тооноос gutter-ийн орныг тооцно", () => {
  const { backdrop } = fresh();
  backdrop.render(Array.from({ length: 120 }, () => "x").join("\n"), []);
  assert.equal(
    document.documentElement.style.getPropertyValue("--gutter-digits"),
    "3",
  );
});
