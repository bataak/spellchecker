import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { splitSlides } from "../src/doc/slides.ts";
import { deckDoc } from "../src/office/deck.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { buildOdp } from "../src/office/odp/create.ts";
import { buildPptx } from "../src/office/pptx/create.ts";
import { openDocx, saveDocx } from "../src/office/docx/index.ts";
import { openOdf, saveOdf } from "../src/office/odf/index.ts";
import { openPptx, savePptx } from "../src/office/pptx/index.ts";
import type { SaveResult, TextEdit, TextIndex } from "../src/office/textdoc.ts";

const MD = "# Гарчиг\n\nМонгол улс\n\n## Хоёр\n\nХоёрдугаар мөр";
const doc = () => applyTemplate(parse(MD), findTemplate("report")!);
const deck = () => deckDoc(splitSlides(parse(MD)));

function roundTrip<D extends TextIndex>(
  bytes: Uint8Array,
  open: (bytes: Uint8Array) => D,
  save: (doc: D, edits: TextEdit[]) => SaveResult,
): void {
  const before = open(bytes);
  const start = before.text.indexOf("Монгол");
  assert.ok(start >= 0, before.text);

  const result = save(before, [
    { start, end: start + 6, text: "МОНГОЛ" },
    { start: before.text.length + 5, end: before.text.length + 6, text: "x" },
  ]);

  assert.equal(result.applied.length, 1);
  assert.deepEqual(
    result.skipped.map((item) => item.reason),
    ["crosses-boundary"],
  );
  const after = open(result.bytes);
  assert.ok(after.text.includes("МОНГОЛ улс"), after.text);
  assert.equal(after.text.length, before.text.length);
}

test("docx: засвар хадгалж дахин нээгдэнэ", () => {
  roundTrip(buildDocx(doc(), { toc: false }), openDocx, saveDocx);
});

test("odt: засвар хадгалж дахин нээгдэнэ", () => {
  roundTrip(buildOdt(doc(), { toc: false }), openOdf, saveOdf);
});

test("odp: засвар хадгалж дахин нээгдэнэ", () => {
  roundTrip(buildOdp(deck()), openOdf, saveOdf);
});

test("pptx: засвар хадгалж дахин нээгдэнэ", () => {
  roundTrip(buildPptx(deck()), openPptx, savePptx);
});

test("odf: mimetype эхэнд шахалтгүй бичигдэнэ", () => {
  const bytes = saveOdf(openOdf(buildOdt(doc(), { toc: false })), []).bytes;
  assert.equal(Object.keys(unzipSync(bytes))[0], "mimetype");
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 38)), "mimetype");
});
