import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emptyHistory,
  rebaseHistory,
  record,
  redo,
  undo,
} from "../src/editor/undohistory.ts";

test("буцаах түүхийг бусдын засвараар шилжүүлнэ", () => {
  const history = {
    undo: [
      {
        from: 4,
        removed: "",
        inserted: "XY",
        before: [4, 4] as [number, number],
        after: [6, 6] as [number, number],
        at: 0,
      },
    ],
    redo: [],
  };
  const rebased = rebaseHistory(history, [{ from: 0, to: 0, insert: "123" }]);
  assert.equal(rebased.undo[0]!.from, 7);
  assert.deepEqual(rebased.undo[0]!.after, [9, 9]);
  assert.equal(undo("123abcdXYef", rebased)?.text, "123abcdef");
});

const caret = (at: number): [number, number] => [at, at];

function twoLocalEdits() {
  const start = "0123456789abcdefghij";
  const inserted = start.slice(0, 15) + "X" + start.slice(15);
  const deleted = inserted.slice(5);
  let history = record(
    emptyHistory(),
    start,
    inserted,
    caret(15),
    caret(16),
    0,
  );
  history = record(history, inserted, deleted, caret(5), caret(0), 5000);
  return { deleted, history };
}

test("бусдын засварын дараа дарааллын бүх алхам буцаж, дахин хийгдэнэ", () => {
  const { deleted, history } = twoLocalEdits();
  const text = deleted.slice(0, 12) + "R" + deleted.slice(12);
  const rebased = rebaseHistory(history, [{ from: 12, to: 12, insert: "R" }]);
  assert.equal(rebased.undo[0]!.from, 15);
  assert.deepEqual(rebased.undo[0]!.before, caret(15));
  assert.deepEqual(rebased.undo[0]!.after, caret(16));

  const newest = undo(text, rebased);
  assert.equal(newest?.text, "0123456789abcdeXfRghij");
  const oldest = undo(newest!.text, newest!.history);
  assert.equal(oldest?.text, "0123456789abcdefRghij");

  const again = redo(oldest!.text, oldest!.history);
  assert.equal(again?.text, newest!.text);
  assert.equal(redo(again!.text, again!.history)?.text, text);
});

test("дахин хийх дараалал ч бусдын засвараар шилжинэ", () => {
  const { deleted, history } = twoLocalEdits();
  const newest = undo(deleted, history)!;
  const oldest = undo(newest.text, newest.history)!;
  const rebased = rebaseHistory(oldest.history, [
    { from: 2, to: 2, insert: "R" },
  ]);
  const text = oldest.text.slice(0, 2) + "R" + oldest.text.slice(2);
  const first = redo(text, rebased);
  assert.equal(first?.text, "01R23456789abcdeXfghij");
});

test("бусдын засвар өөрийн алхамтай давхцвал шинэ алхмууд үлдэж, хуучин нь хасагдана", () => {
  const { history } = twoLocalEdits();
  const rebased = rebaseHistory(history, [{ from: 2, to: 3, insert: "" }]);
  assert.equal(rebased.undo.length, 2);
  const blocked = rebaseHistory(history, [{ from: 10, to: 11, insert: "" }]);
  assert.equal(blocked.undo.length, 1);
  assert.equal(blocked.undo[0]!.removed, "01234");
});

test("алхмын эхлэл дээрх бусдын оруулга түүнийг шилжүүлнэ", () => {
  const history = record(emptyHistory(), "абв", "аXбв", caret(1), caret(2), 0);
  const rebased = rebaseHistory(history, [{ from: 1, to: 1, insert: "R" }]);
  assert.equal(rebased.undo[0]!.from, 2);
  assert.equal(undo("аRXбв", rebased)?.text, "аRбв");
});
