import { test } from "node:test";
import assert from "node:assert/strict";
import { lineSelection } from "../src/editor/lineselect.ts";

const text = "нэг\nхоёр\nгурав\nдөрөв";

test("lineSelection: карет байгаа мөрийг шинэ мөрийн тэмдэгтэй нь сонгоно", () => {
  assert.deepEqual(lineSelection(text, 6, 6, "down"), [4, 9]);
  assert.deepEqual(lineSelection(text, 6, 6, "up"), [4, 9]);
  assert.deepEqual(lineSelection(text, 0, 0, "down"), [0, 4]);
});

test("lineSelection: дахин дарахад доош эсвэл дээш нэг мөр нэмнэ", () => {
  assert.deepEqual(lineSelection(text, 4, 9, "down"), [4, 15]);
  assert.deepEqual(lineSelection(text, 4, 9, "up"), [0, 9]);
  assert.deepEqual(lineSelection(text, 0, 9, "up"), [0, 9]);
});

test("lineSelection: сүүлийн мөр шинэ мөрийн тэмдэггүй байсан ч зөв сонгоно", () => {
  assert.deepEqual(lineSelection(text, 17, 17, "down"), [15, 20]);
  assert.deepEqual(lineSelection(text, 15, 20, "down"), [15, 20]);
  assert.deepEqual(lineSelection(text, 15, 20, "up"), [9, 20]);
});

test("lineSelection: хэсэгчилсэн сонголтыг бүтэн мөр болгож өргөтгөнө", () => {
  assert.deepEqual(lineSelection(text, 5, 11, "down"), [4, 15]);
  assert.deepEqual(lineSelection(text, 5, 9, "up"), [4, 9]);
});
