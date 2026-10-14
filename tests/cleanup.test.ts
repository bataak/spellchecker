import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanText,
  fixMisletters,
  hasMarkup,
  hasMisletters,
  needsCleanup,
  stripMarkup,
} from "../src/cleanup.ts";

test("Нэг шошго эсвэл харьцуулалтын тэмдгийг HTML гэж үзэхгүй", () => {
  assert.equal(hasMarkup("a < b ба c > d"), false);
  assert.equal(hasMarkup("мөр<br>мөр"), false);
  assert.equal(hasMarkup("<p>нэг</p>"), true);
});

test("Блок шошгыг мөр болгож, inline шошгыг арилгана", () => {
  assert.equal(
    stripMarkup("<div><span>сайн </span><b>байна</b></div>\n<div>уу</div>"),
    "сайн байна\nуу",
  );
});

test("Догол мөрийн хооронд хоосон мөр үлдээнэ", () => {
  assert.equal(stripMarkup("<p>нэг</p>\n<p>хоёр</p>"), "нэг\n\nхоёр");
});

test("Entity-г тайлж, зөвхөн зайтай мөрийг хасна", () => {
  assert.equal(
    stripMarkup(
      "<div>a &amp; b&#33;</div><div>&nbsp;</div><div>&laquo;c&raquo;</div>",
    ),
    "a & b!\n«c»",
  );
});

test("Кирилл үгийн доторх v, є, ї-г ү, ө болгоно", () => {
  assert.equal(fixMisletters("Vнэн хvн єдєр"), "Үнэн хүн өдөр");
  assert.equal(fixMisletters("їзэх"), "үзэх");
});

test("Латин үгийн v-д хүрэхгүй", () => {
  assert.equal(fixMisletters("TV, vector, Davaaгийн"), "TV, vector, Davaaгийн");
  assert.equal(hasMisletters("vector TV v"), false);
});

test("Цэвэр бичвэрт товчлуур хэрэггүй", () => {
  assert.equal(needsCleanup("Монгол хэл үзэсгэлэнтэй"), false);
  assert.equal(needsCleanup("хvн"), true);
});

test("cleanText шошго болон үсгийг хамт засна", () => {
  assert.equal(
    cleanText('<div class="x"><span>хvч </span><span>єгнє</span></div>'),
    "хүч өгнө",
  );
});

test("<Enter>, <Esc> зэрэг товчны нэрийг шошго гэж үзэхгүй", () => {
  const text =
    "Хадгалахын тулд <Enter> товч, болиулахын тулд <Esc> товч дарна.\nЭнэ бол хоёр дахь мөр. <Del>, <Menu>";
  assert.equal(hasMarkup(text), false);
  assert.equal(needsCleanup(text), false);
  assert.equal(
    stripMarkup("<p><Enter> дар</p><DIV>хоёр</DIV>"),
    "<Enter> дар\n\nхоёр",
  );
});
