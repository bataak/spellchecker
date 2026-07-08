import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkable,
  isDashSuffix,
  startsLowerAfterDash,
  buildErrorList,
} from "../src/textcheck.js";

test("checkable: үсэг агуулсан 2+ тэмдэгт үгийг зөвшөөрнө", () => {
  for (const w of ["үг", "цэнг", "word", "café", "5а", "ТЕГ-аас"]) {
    assert.equal(checkable(w), true, w);
  }
});

test("checkable: ганц тэмдэгт, тоо, тэмдэгтийг хасна", () => {
  for (const w of ["б", "1 ", "12", "№5", "12)", "50-", "50-ны", "  ", ""]) {
    assert.equal(checkable(w), false, JSON.stringify(w));
  }
});

test("isDashSuffix: зураасаар эхэлсэн токен", () => {
  assert.equal(isDashSuffix("юм -ны юм", { word: "-ны", start: 3 }), true);
});

test("isDashSuffix: бичвэр дэх өмнөө тэмдэгтэй зураас", () => {
  assert.equal(isDashSuffix("50-ны", { word: "ны", start: 3 }), true);
});

test("isDashSuffix: дундаа зураастай бүтэн үг биш", () => {
  assert.equal(isDashSuffix("ТЕГ-аас", { word: "ТЕГ-аас", start: 0 }), false);
});

test("isDashSuffix: энгийн үг биш", () => {
  assert.equal(isDashSuffix("юм ны юм", { word: "ны", start: 3 }), false);
});

test("startsLowerAfterDash: жижиг үсгээр эхэлсэн нөхцөл", () => {
  assert.equal(startsLowerAfterDash("-ны"), true);
  assert.equal(startsLowerAfterDash("ны"), true);
});

test("startsLowerAfterDash: том үсэг ба хоосон", () => {
  assert.equal(startsLowerAfterDash("-Улаанбаатар"), false);
  assert.equal(startsLowerAfterDash("-"), false);
  assert.equal(startsLowerAfterDash("-5"), false);
});

test("buildErrorList: case-insensitive давхардлыг тоолж нэгтгэнэ", () => {
  const items = buildErrorList([
    { word: "Үг", start: 0 },
    { word: "үг", start: 10 },
    { word: "өөр", start: 20 },
  ]);
  assert.equal(items.length, 2);
  const first = items.find((i) => i.word === "Үг");
  assert.equal(first.count, 2);
  assert.equal(first.start, 0);
  assert.equal(items.find((i) => i.word === "өөр").count, 1);
});

test("buildErrorList: хоосон оролт", () => {
  assert.deepEqual(buildErrorList([]), []);
});
