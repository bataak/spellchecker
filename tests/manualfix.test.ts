import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_FIX_MAX,
  cleanManualFix,
  countWords,
  filterManualFix,
} from "../src/manualfix.ts";
import { replaceAllWord } from "../src/wordfix.ts";

test("гараар засварыг тайрч, хоосон ба өөрчлөлтгүйг хүлээж авахгүй", () => {
  assert.equal(cleanManualFix("  Улаанбаатар ", "Улаанбаатр"), "Улаанбаатар");
  assert.equal(cleanManualFix("   ", "үг"), null);
  assert.equal(cleanManualFix(" үг ", "үг"), null);
  assert.equal(cleanManualFix("Үг", "үг"), "Үг");
});

test("кирилл, латин үсэг ба . , ; - тэмдэгтийг л үлдээнэ", () => {
  assert.equal(filterManualFix("Өрөө, word; э-мэйл."), "Өрөө, word; э-мэйл.");
  assert.equal(filterManualFix('a1<b>&"x"`z`$5€№₮:?!()'), "abxz");
  assert.equal(filterManualFix("αβγ 中文 😀ok"), "ok");
  assert.equal(filterManualFix("а\u0000б в￾\uD800г"), "аб вг");
  assert.equal(filterManualFix("й"), "й");
});

test("зайг нэг зай болгож, эхний зайг хасна", () => {
  assert.equal(
    filterManualFix("  нэг\t\tхоёр\r\nгурав  дөрөв "),
    "нэг хоёр гурав дөрөв ",
  );
  assert.equal(cleanManualFix("нэг\nхоёр", "x"), "нэг хоёр");
});

test("таваас олон үгийг хүлээж авахгүй", () => {
  assert.equal(countWords("нэг хоёр гурав дөрөв тав "), 5);
  assert.equal(cleanManualFix("a b c d e", "x"), "a b c d e");
  assert.equal(cleanManualFix("a b c d e f", "x"), null);
  assert.equal(cleanManualFix("a".repeat(MANUAL_FIX_MAX + 1), "x"), null);
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
    "абв, абв-гд",
    0,
    "lower",
  );
  assert.equal(text, "абв, абв-гд гд абв, абв-гд");
});
