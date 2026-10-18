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

test("Кирилл үгийн доторх латин e-г е болгоно", () => {
  assert.equal(
    fixMisletters("үeийн үeэр Eрөнхий тvвшин"),
    "үеийн үеэр Ерөнхий түвшин",
  );
  assert.equal(hasMisletters("судалгааны үeэр"), true);
});

test("Кирилл үгийн доторх латин a, o, p, c, x, T, B-г кирилл болгоно", () => {
  assert.equal(
    fixMisletters(
      "тaлбaр мoнгoл хүpээ cүүл Taлбай Bикипедиа Aав Oюун Pаш Cар xүн Xан",
    ),
    "талбар монгол хүрээ сүүл Талбай Википедиа Аав Оюун Раш Сар хүн Хан",
  );
});

test("Кирилл үгийн доторх латин H-г Н болгоно", () => {
  assert.equal(fixMisletters("Hэр HИЙТ Hөхөр"), "Нэр НИЙТ Нөхөр");
  assert.equal(hasMisletters("Hийслэл"), true);
  assert.equal(hasMisletters("HTML Hello H"), false);
  assert.equal(fixMisletters("Hello-гийн"), "Hello-гийн");
});

test("Кирилл үгийн доторх латин M-г М болгоно", () => {
  assert.equal(fixMisletters("Mонгол MЭДЭЭ Mөнх"), "Монгол МЭДЭЭ Мөнх");
  assert.equal(hasMisletters("Mаргааш"), true);
  assert.equal(hasMisletters("MHz Mike M"), false);
  assert.equal(fixMisletters("Microsoft-ийн"), "Microsoft-ийн");
});

test("Латин үг, холимог нэрийн e-д хүрэхгүй", () => {
  assert.equal(
    fixMisletters("hello Excel-ийн iPhoneийн"),
    "hello Excel-ийн iPhoneийн",
  );
  assert.equal(hasMisletters("e Ee eve cap TOP Bob box"), false);
  assert.equal(fixMisletters("Bluetooth-ийн"), "Bluetooth-ийн");
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
