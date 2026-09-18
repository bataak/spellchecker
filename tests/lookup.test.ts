import test from "node:test";
import assert from "node:assert/strict";

import {
  isLookupKey,
  lookupKeys,
  normalizeKey,
  wordAt,
  type WordSpan,
} from "../src/lookup.ts";

const at = (text: string, offset: number): string | null =>
  wordAt(text, offset)?.word ?? null;

const key = (over: Partial<Parameters<typeof isLookupKey>[0]>) =>
  isLookupKey({
    code: "Space",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  });

test("wordAt — үгийн дотор", () => {
  const text = "Монгол хэл";
  for (let i = 0; i <= 6; i += 1) assert.equal(at(text, i), "Монгол", `${i}`);
});

test("wordAt — үгийн эхэнд ба төгсгөлд", () => {
  const text = "аав ээж";
  assert.equal(at(text, 3), "аав");
  assert.equal(at(text, 4), "ээж");
  assert.equal(at(text, 7), "ээж");
});

test("wordAt — зайн дунд бол үг олдохгүй", () => {
  assert.equal(at("аав  ээж", 4), null);
  assert.equal(at("", 0), null);
  assert.equal(at("   ", 1), null);
});

test("wordAt — дотоод зураас нэг үг", () => {
  const text = "аav";
  assert.equal(at("хар-цагаан", 4), "хар-цагаан");
  assert.equal(at("хар\u2011цагаан", 4), "хар\u2011цагаан");
  assert.ok(text.length > 0);
});

test("wordAt — захын зураас, хашилт хасагдана", () => {
  assert.deepEqual(wordAt("-ээс", 2), {
    start: 1,
    end: 4,
    word: "ээс",
  } satisfies WordSpan);
  assert.equal(at("\u2019гэр\u2019", 2), "гэр");
  assert.equal(at("«гэр»", 2), "гэр");
});

test("wordAt — дотоод таслах тэмдэг", () => {
  assert.equal(at("үгүй\u2019ээ", 2), "үгүй\u2019ээ");
  assert.equal(at("үгүй'ээ", 2), "үгүй'ээ");
});

test("wordAt — кирилл биш тэмдэгт таслана", () => {
  assert.equal(at("40х60", 3), "х");
  assert.equal(at("тоо123", 2), "тоо");
  assert.equal(at("code", 2), null);
  assert.equal(at("гэр.", 3), "гэр");
  assert.equal(at("гэр.", 4), null);
});

test("wordAt — цэг таслалаар тусгаарлагдана", () => {
  assert.equal(at("Сайн уу? Би ирлээ.", 9), "Би");
  assert.equal(at("нэг,хоёр", 4), "хоёр");
});

test("wordAt — хязгаараас гадуур", () => {
  assert.equal(wordAt("гэр", -1), null);
  assert.equal(wordAt("гэр", 4), null);
});

test("wordAt — start ба end яг үгийг заана", () => {
  const text = "Улаанбаатар хот";
  const span = wordAt(text, 13);
  assert.ok(span);
  assert.equal(text.slice(span.start, span.end), span.word);
  assert.deepEqual(span, { start: 12, end: 15, word: "хот" });
});

test("normalizeKey — зураас ба таслах тэмдэг жигдэрнэ", () => {
  assert.equal(normalizeKey("хар\u2011цагаан"), "хар-цагаан");
  assert.equal(normalizeKey("үгүй'ээ"), "үгүй\u2019ээ");
});

test("lookupKeys — эх хэлбэр, дараа нь жижиг үсэг", () => {
  assert.deepEqual(lookupKeys("Монгол"), ["Монгол", "монгол"]);
  assert.deepEqual(lookupKeys("монгол"), ["монгол"]);
});

test("isLookupKey — Ctrl+Shift+Space ба Cmd+Shift+Space", () => {
  assert.equal(key({ ctrlKey: true, shiftKey: true }), true);
  assert.equal(key({ metaKey: true, shiftKey: true }), true);
});

test("isLookupKey — дутуу эсвэл илүү modifier", () => {
  assert.equal(key({ ctrlKey: true }), false);
  assert.equal(key({ shiftKey: true }), false);
  assert.equal(key({ ctrlKey: true, shiftKey: true, altKey: true }), false);
});

test("isLookupKey — өөр товч", () => {
  assert.equal(key({ code: "KeyZ", ctrlKey: true, shiftKey: true }), false);
  assert.equal(key({ code: "Period", ctrlKey: true, shiftKey: true }), false);
});

test("isLookupKey — F2 нөөц зам", () => {
  assert.equal(key({ code: "F2" }), true);
  assert.equal(key({ code: "F2", ctrlKey: true }), false);
});
