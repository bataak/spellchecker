import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mapToSource,
  mergeEdit,
  renderFlat,
  suggestName,
} from "../src/office/mode.ts";
import { splitName } from "../src/office/filename.ts";
import type { OfficeEdit } from "../src/office/mode.ts";

const SRC = "монгол улс\n\nхоёрдугаар мөр";

function apply(
  edits: OfficeEdit[],
  start: number,
  end: number,
  text: string,
): OfficeEdit[] {
  const mapped = mapToSource(SRC, edits, start, end, text);
  assert.notEqual(mapped, null);
  return mergeEdit(SRC, edits, mapped!.start, mapped!.end, mapped!.text);
}

test("renders edits onto the source", () => {
  assert.equal(
    renderFlat(SRC, [{ start: 0, end: 6, text: "Монгол" }]),
    "Монгол улс\n\nхоёрдугаар мөр",
  );
});

test("maps a later edit past an earlier length change", () => {
  let edits = apply([], 0, 6, "МОНГОЛЫН");
  assert.equal(renderFlat(SRC, edits), "МОНГОЛЫН улс\n\nхоёрдугаар мөр");

  edits = apply(edits, 14, 24, "ХОЁРДУГААР");
  assert.equal(renderFlat(SRC, edits), "МОНГОЛЫН улс\n\nХОЁРДУГААР мөр");
  assert.equal(edits.length, 2);
});

test("replaces an earlier edit instead of stacking", () => {
  let edits = apply([], 0, 6, "Мангал");
  edits = apply(edits, 0, 6, "Монгол");

  assert.equal(edits.length, 1);
  assert.equal(renderFlat(SRC, edits), "Монгол улс\n\nхоёрдугаар мөр");
});

test("drops an edit when the text returns to the original", () => {
  let edits = apply([], 0, 6, "Монгол");
  edits = apply(edits, 0, 6, "монгол");

  assert.equal(edits.length, 0);
  assert.equal(renderFlat(SRC, edits), SRC);
});

test("expands a selection that partially covers an edit", () => {
  let edits = apply([], 0, 6, "МОНГОЛЫН");
  edits = apply(edits, 2, 5, "X");

  assert.equal(edits.length, 1);
  assert.equal(edits[0].start, 0);
  assert.equal(edits[0].end, 6);
});

test("names the saved file per format", () => {
  assert.equal(suggestName("tailan.docx", "docx"), "tailan-zassan.docx");
  assert.equal(suggestName("iltgel.pptx", "pptx"), "iltgel-zassan.pptx");
  assert.equal(suggestName("bichig.odt", "odt"), "bichig-zassan.odt");
  assert.equal(suggestName("slide.odp", "odp"), "slide-zassan.odp");
});

test("returns null for an offset outside the document", () => {
  assert.equal(mapToSource(SRC, [], 500, 505, "x"), null);
});

test("the output name does not grow when saving twice", () => {
  assert.equal(suggestName("tailan-zassan.docx", "docx"), "tailan-zassan.docx");
  assert.equal(
    suggestName("tailan-zassan-zassan.docx", "docx"),
    "tailan-zassan.docx",
  );
  assert.equal(
    suggestName("ZASSAN-tailan.docx", "docx"),
    "ZASSAN-tailan-zassan.docx",
  );
});

test("the suffix is only stripped at the end of the base name", () => {
  assert.equal(suggestName("zassan.odt", "odt"), "zassan-zassan.odt");
  assert.equal(
    suggestName("a-zassan-b.pptx", "pptx"),
    "a-zassan-b-zassan.pptx",
  );
});

test("survives a long chain of corrections", () => {
  const source = "аав ээж ах эгч дүү";
  let edits: OfficeEdit[] = [];

  const step = (start: number, end: number, text: string): void => {
    const mapped = mapToSource(source, edits, start, end, text);
    assert.notEqual(mapped, null);
    edits = mergeEdit(source, edits, mapped!.start, mapped!.end, mapped!.text);
  };

  step(0, 3, "ААВЫН");
  step(6, 9, "ЭЭЖИЙН");
  step(13, 15, "АХЫН");
  step(18, 21, "ЭГЧИЙН");
  step(25, 28, "ДҮҮГИЙН");

  assert.equal(renderFlat(source, edits), "ААВЫН ЭЭЖИЙН АХЫН ЭГЧИЙН ДҮҮГИЙН");
  assert.equal(edits.length, 5);
  assert.deepEqual(
    edits.map((edit) => edit.start),
    [0, 4, 8, 11, 15],
  );
});

test("reverts one edit while keeping the others", () => {
  const source = "нэг хоёр";
  let edits: OfficeEdit[] = [];

  const step = (start: number, end: number, text: string): void => {
    const mapped = mapToSource(source, edits, start, end, text);
    edits = mergeEdit(source, edits, mapped!.start, mapped!.end, mapped!.text);
  };

  step(0, 3, "НЭГ");
  step(4, 8, "ХОЁР");
  assert.equal(edits.length, 2);

  edits = edits.filter((edit) => edit.start !== 0);
  assert.equal(renderFlat(source, edits), "нэг ХОЁР");
});

test("splits a name so the tail and extension are never cut", () => {
  const name = "386_MNG Далайн захиргааны 2026 оны илтгэл Эрээн.pptx";
  const parts = splitName(name);

  assert.equal(parts.head + parts.tail, name);
  assert.ok(parts.tail.endsWith(".pptx"));
});

test("scales the kept tail with the length of the name", () => {
  const short = splitName("uliraliin-tailan.odt");
  const long = splitName(
    "gerchilgee-2026-uliraliin-uildveriin-udirdlagiin-zuvluliin-temdeglel.docx",
  );

  assert.ok(long.tail.length > short.tail.length);
  assert.equal(short.tail.length, Math.round(16 * 0.35) + ".odt".length);
});

test("never keeps fewer than six or more than twenty base characters", () => {
  const tiny = splitName("aaaaaaaaaaaa.docx");
  const huge = splitName("a".repeat(400) + ".docx");

  assert.equal(tiny.head + tiny.tail, "aaaaaaaaaaaa.docx");
  assert.equal(huge.tail.length, 20 + ".docx".length);
});

test("keeps a short name whole with nothing to shrink", () => {
  assert.deepEqual(splitName("geree.docx"), { head: "", tail: "geree.docx" });
});

test("splits a name that has no extension", () => {
  const parts = splitName("uliraliintemdeglelhuvilbar");

  assert.equal(parts.head + parts.tail, "uliraliintemdeglelhuvilbar");
  assert.ok(parts.tail.length >= 6);
});

test("treats a long trailing segment as part of the name, not an extension", () => {
  const parts = splitName("tailan.uliraliintemdeglelhuvilbar");

  assert.equal(parts.head + parts.tail, "tailan.uliraliintemdeglelhuvilbar");
  assert.ok(!parts.tail.startsWith("."));
});
