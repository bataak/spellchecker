import { test } from "node:test";
import assert from "node:assert/strict";
import { MANUAL_FIX_MAX, cleanManualFix } from "../src/manualfix.ts";
import { replaceAllWord } from "../src/wordfix.ts";

test("гараар засварыг тайрч, хоосон ба өөрчлөлтгүйг хүлээж авахгүй", () => {
  assert.equal(cleanManualFix("  Улаанбаатар ", "Улаанбаатр"), "Улаанбаатар");
  assert.equal(cleanManualFix("   ", "үг"), null);
  assert.equal(cleanManualFix(" үг ", "үг"), null);
  assert.equal(cleanManualFix("Үг", "үг"), "Үг");
});

test("олон үгийн хоорондох мөр, таб, давхар зайг нэг зай болгоно", () => {
  assert.equal(
    cleanManualFix("нэг\t\tхоёр\r\nгурав  дөрөв", "x"),
    "нэг хоёр гурав дөрөв",
  );
});

test("удирдах тэмдэгт ба XML-д хориотой тэмдэгтийг хасна", () => {
  assert.equal(cleanManualFix("а\u0000б\u0007в\u2028г\u0085", "x"), "абвг");
  assert.equal(cleanManualFix("а\uFFFEб\uD800в\uDC00", "x"), "абв");
  assert.equal(cleanManualFix("😀ok", "x"), "😀ok");
});

test("цэг тэмдэг, код зэрэг тэмдэгтийг хэвээр үлдээнэ", () => {
  const code = '<b>x</b> & "y" `z` $a_1$ **b** {c}';
  assert.equal(cleanManualFix(code, "x"), code);
  assert.equal(cleanManualFix("5 кг", "x"), "5 кг");
});

test("хэт урт засварыг тэмдэгтээр нь тайрна", () => {
  const long = "😀".repeat(MANUAL_FIX_MAX + 10);
  assert.equal([...cleanManualFix(long, "x")!].length, MANUAL_FIX_MAX);
});

test("олон үгтэй засвар бүх тохиолдолд том жижиг үсгээ дагаж орно", () => {
  const { text } = replaceAllWord(
    "Алдаатүг ба алдаатүг, АЛДААТҮГ.",
    "алдаатүг",
    "зөв үг",
    0,
    "capital",
  );
  assert.equal(text, "Зөв үг ба зөв үг, ЗӨВ ҮГ.");
});

test("цэг тэмдэгтэй засвар өөрийгөө дахин солихгүй", () => {
  const { text } = replaceAllWord(
    "абв гд абв",
    "абв",
    "(абв) — абв",
    0,
    "lower",
  );
  assert.equal(text, "(абв) — абв гд (абв) — абв");
});
