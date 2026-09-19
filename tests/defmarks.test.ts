import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDefinitionMarks } from "../src/defmarks.ts";

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
