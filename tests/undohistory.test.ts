import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHARS,
  MAX_STEPS,
  checksum,
  emptyHistory,
  record,
  redo,
  undo,
} from "../src/undohistory.ts";

function type(
  text: string,
  at: number,
  chunk: string,
  h = emptyHistory(),
  now = 0,
) {
  const next = text.slice(0, at) + chunk + text.slice(at);
  return {
    text: next,
    h: record(
      h,
      text,
      next,
      [at, at],
      [at + chunk.length, at + chunk.length],
      now,
    ),
  };
}

test("ойрхон бичсэн үсгүүдийг нэг алхам болгоно", () => {
  let s = type("", 0, "а");
  s = type(s.text, 1, "б", s.h, 200);
  s = type(s.text, 2, "в", s.h, 400);
  assert.equal(s.h.undo.length, 1);
  const back = undo(s.text, s.h)!;
  assert.equal(back.text, "");
});

test("зогсолтын дараа шинэ алхам эхэлнэ, redo сэргээнэ", () => {
  let s = type("", 0, "нэг");
  s = type(s.text, 3, " хоёр", s.h, 5000);
  assert.equal(s.h.undo.length, 2);
  const one = undo(s.text, s.h)!;
  assert.equal(one.text, "нэг");
  assert.deepEqual(one.selection, [3, 3]);
  const again = redo(one.text, one.history)!;
  assert.equal(again.text, "нэг хоёр");
});

test("шинэ засвар redo-г цэвэрлэнэ", () => {
  let s = type("", 0, "нэг");
  s = type(s.text, 3, " хоёр", s.h, 5000);
  const one = undo(s.text, s.h)!;
  const h = record(one.history, one.text, one.text + "!", [3, 3], [4, 4], 9000);
  assert.equal(h.redo.length, 0);
});

test("устгалтыг буцааж сэргээнэ", () => {
  const h = record(emptyHistory(), "сайн байна", "сайн", [10, 10], [4, 4], 0);
  assert.equal(undo("сайн", h)!.text, "сайн байна");
});

test("текст тохирохгүй бол undo хийхгүй", () => {
  const s = type("", 0, "нэг");
  assert.equal(undo("өөр текст", s.h), null);
});

test("10,000 алхмаас хэтэрвэл хамгийн хуучныг хасна", () => {
  let h = emptyHistory();
  let text = "";
  for (let i = 0; i < MAX_STEPS + 5; i++) {
    const next = text + "\n";
    h = record(h, text, next, [0, 0], [0, 0], i * 5000);
    text = next;
  }
  assert.equal(h.undo.length, MAX_STEPS);
});

test("хэмжээ хэтэрвэл хамгийн хуучныг хасна", () => {
  const big = "а".repeat(MAX_CHARS / 2 + 1);
  let h = record(emptyHistory(), "", big, [0, 0], [0, 0], 0);
  h = record(h, big, big + "\n" + big, [0, 0], [0, 0], 5000);
  assert.equal(h.undo.length, 1);
});

test("checksum текстээс хамаарна", () => {
  assert.equal(checksum("абв"), checksum("абв"));
  assert.notEqual(checksum("абв"), checksum("абг"));
});
