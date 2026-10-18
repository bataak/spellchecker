import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editedWord,
  nextFixStep,
  pendingFixFor,
  planSuggestion,
  propagateFix,
} from "../src/spell/applyfix.ts";

const text = "Сайн байнаа уу. Байнаа гэж бичлээ.";
const token = { word: "байнаа", start: 5, end: 11 };

test("planSuggestion бүх давталтыг үсгийн хэлбэрийг хадгалж солино", () => {
  assert.deepEqual(planSuggestion(text, token, "байна", [], []), {
    text: "Сайн байна уу. Байна гэж бичлээ.",
    caret: 10,
  });
});

test("planSuggestion өөрчлөлтгүй бол null буцаана", () => {
  assert.equal(planSuggestion(text, token, "байнаа", [], []), null);
});

test("planSuggestion хашилт доторх үгийг зөвхөн тухайн байрлалд солино", () => {
  assert.deepEqual(
    planSuggestion(text, token, "байна", [], [{ start: 0, end: 15 }]),
    { text: "Сайн байна уу. Байнаа гэж бичлээ.", caret: 10 },
  );
});

test("planSuggestion цэгийн дараах зайг бүх давталтад нэмнэ", () => {
  assert.deepEqual(
    planSuggestion(
      "үг.Нэг үг.Нэг",
      { word: "үг.Нэг", start: 0, end: 6 },
      "үг. Нэг",
      [],
      [],
    ),
    { text: "үг. Нэг үг. Нэг", caret: 7 },
  );
});

test("editedWord тэмдэгтийн өмнөх үгийг олно", () => {
  assert.deepEqual(editedWord("Сайн байна уу.", 11), {
    word: "байна",
    start: 5,
    end: 10,
  });
});

test("nextFixStep гараар зассан үгийг шалгах эсэхийг шийднэ", () => {
  const fix = pendingFixFor(text, token);
  assert.deepEqual(fix, {
    original: "байнаа",
    originalPattern: "lower",
    dashSuffix: false,
    start: 5,
  });
  assert.deepEqual(nextFixStep(fix, "Сайн байна уу. Байнаа.", 10), {
    kind: "check",
    word: "байна",
  });
  assert.deepEqual(nextFixStep(fix, "Сайн байнаа уу.", 11), { kind: "wait" });
  assert.deepEqual(nextFixStep(fix, "Сайн б уу.", 6), { kind: "wait" });
  assert.deepEqual(nextFixStep(fix, "Сайн байнаа уу.", 1), { kind: "drop" });
  assert.deepEqual(
    nextFixStep({ ...fix, dashSuffix: true }, "Сайн байна уу.", 10),
    { kind: "drop" },
  );
});

test("propagateFix засварыг бусад давталтад тараана", () => {
  const fix = pendingFixFor(text, token);
  assert.deepEqual(
    propagateFix("Сайн байна уу. Байнаа гэж бичлээ.", 10, fix, "байна", []),
    { text: "Сайн байна уу. Байна гэж бичлээ.", caret: 10 },
  );
  assert.equal(propagateFix("Сайн байна уу.", 10, fix, "байна", []), null);
});
