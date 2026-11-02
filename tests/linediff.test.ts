import assert from "node:assert/strict";
import { test } from "node:test";

import { lineDiff } from "../src/office/linediff.ts";
import { syncEdits } from "../src/office/editsync.ts";
import { renderFlat } from "../src/office/textdoc.ts";
import type { OfficeEdit } from "../src/office/mode.ts";

function sync(source: string, edits: OfficeEdit[], next: string): OfficeEdit[] {
  const result = syncEdits(source, edits, renderFlat(source, edits), next);
  assert.notEqual(result, null);
  return result!;
}

test("returns no spans when nothing changed", () => {
  assert.deepEqual(lineDiff("нэг\nхоёр", "нэг\nхоёр"), []);
});

test("narrows each changed line independently", () => {
  assert.deepEqual(
    lineDiff("монгол улс\nмонгол хэл", "Монгол улс\nМонгол хэл"),
    [
      { start: 0, end: 1, text: "М" },
      { start: 11, end: 12, text: "М" },
    ],
  );
});

test("refuses a diff that changes the line count", () => {
  assert.equal(lineDiff("нэг", "нэг\nхоёр"), null);
});

test("keeps offsets correct when an earlier line grows", () => {
  const spans = lineDiff("аав\nээж", "аавууд\nЭЭЖ");

  assert.equal(spans![0].start, 3);
  assert.equal(spans![1].start, 4);
});

test("replace-all across paragraphs lands as separate edits", () => {
  const source = "монгол хэл\n\nмонгол бичиг\n\nмонгол улс";
  const edits = sync(source, [], "Монгол хэл\n\nМонгол бичиг\n\nМонгол улс");

  assert.equal(
    renderFlat(source, edits),
    "Монгол хэл\n\nМонгол бичиг\n\nМонгол улс",
  );
  assert.equal(edits.length, 3);
  assert.deepEqual(
    edits.map((edit) => edit.start),
    [0, 12, 26],
  );
});

test("a second replace-all stacks correctly on the first", () => {
  const source = "хар нохой\n\nхар муур";
  let edits = sync(source, [], "хараар нохой\n\nхараар муур");
  edits = sync(source, edits, "хараар НОХОЙ\n\nхараар муур");

  assert.equal(renderFlat(source, edits), "хараар НОХОЙ\n\nхараар муур");
  assert.equal(edits.length, 3);
});

test("reverting a word to its original drops the edit", () => {
  const source = "монгол хэл";
  let edits = sync(source, [], "Монгол хэл");
  assert.equal(edits.length, 1);

  edits = sync(source, edits, "монгол хэл");
  assert.equal(edits.length, 0);
});
