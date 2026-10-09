import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayHeadword,
  pickDefinitionMarks,
  placeTipAtPointer,
} from "../src/defmarks.ts";

test("тайлбартай санал бүрийг тэмдэглэнэ", () => {
  const found = {
    сэтгэгдэлд: "СЭТГЭГДЭЛ",
    сэтгэгдэлтүүд: "СЭТГЭГДЭЛТЭЙ",
    сэтгэгдлүүд: "СЭТГЭГДЭЛ",
  };
  assert.deepEqual(
    [
      ...pickDefinitionMarks(
        ["сэтгэгдэлд", "сэтгэгдэлтүүд", "сэтгэгдлүүд"],
        found,
      ),
    ],
    ["сэтгэгдэлд", "сэтгэгдэлтүүд", "сэтгэгдлүүд"],
  );
});

test("тайлбаргүй саналыг тэмдэглэхгүй", () => {
  assert.deepEqual(
    [...pickDefinitionMarks(["ингэхдээ", "ингэхээ"], { ингэхдээ: "ИНГЭХ" })],
    ["ингэхдээ"],
  );
  assert.equal(pickDefinitionMarks(["ингэхдээ"], null).size, 0);
});

test("зөвхөн том жижиг үсгээр ялгаатай саналыг нэг удаа тэмдэглэнэ", () => {
  const found = { Ингэхдээ: "ИНГЭХ", ингэхдээ: "ИНГЭХ" };
  assert.deepEqual(
    [...pickDefinitionMarks(["Ингэхдээ", "ингэхдээ"], found)],
    ["Ингэхдээ"],
  );
});

const view = { left: 0, top: 0, width: 1000, height: 800 };
const tip = { width: 300, height: 200 };

test("тайлбарыг заагчийн баруун доор, үгийн мөрийн доор байрлуулна", () => {
  const line = { left: 100, top: 100, right: 180, bottom: 124 };
  assert.deepEqual(placeTipAtPointer(140, line, tip, view), {
    left: 140,
    top: 132,
    maxHeight: 660,
  });
});

test("доор багтахгүй бол үгийн мөрийн дээр байрлуулна", () => {
  const line = { left: 100, top: 700, right: 180, bottom: 724 };
  assert.deepEqual(placeTipAtPointer(140, line, tip, view), {
    left: 140,
    top: 492,
    maxHeight: 684,
  });
});

test("баруун талд багтахгүй бол зүүн тийш шахна", () => {
  const line = { left: 900, top: 100, right: 980, bottom: 124 };
  assert.deepEqual(placeTipAtPointer(950, line, tip, view), {
    left: 692,
    top: 132,
    maxHeight: 660,
  });
});

test("аль ч талд багтахгүй бол илүү зайтай талд багасгаж байрлуулна", () => {
  const tall = { width: 300, height: 500 };
  assert.deepEqual(
    placeTipAtPointer(
      140,
      { left: 100, top: 360, right: 180, bottom: 384 },
      tall,
      view,
    ),
    { left: 140, top: 392, maxHeight: 400 },
  );
  assert.deepEqual(
    placeTipAtPointer(
      140,
      { left: 100, top: 440, right: 180, bottom: 464 },
      tall,
      view,
    ),
    { left: 140, top: 8, maxHeight: 424 },
  );
});

test("бүгд том үсгээр бичсэн үгийн толгой үгийг жижиг үсгээр харуулна", () => {
  assert.equal(displayHeadword("ИТГЭЛТЭЙ", "ИТГЭЛТЭЙ"), "итгэлтэй");
  assert.equal(displayHeadword("ИТГЭЛ", "ИТГЭЛТЭЙ"), "итгэл");
  assert.equal(displayHeadword("ИТГЭЛТЭЙ", "Итгэлтэй"), "Итгэлтэй");
  assert.equal(displayHeadword("Монгол", "МОНГОЛ"), "Монгол");
});
