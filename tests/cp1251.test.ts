import { test } from "node:test";
import assert from "node:assert/strict";
import {
  charToByte,
  countMojibakeLetters,
  countMojibakeWords,
  decodeWith,
  detectVariant,
  fixSlotsInWords,
  repairCyrillic,
  repairCyrillicDetailed,
} from "../src/cp1251.ts";

const T2A_LOWER_BROKEN = "àáâãäå¼æçèéêëìíî°ïðñòó³ôõö÷øùúûüýþÿ";
const T2A_LOWER_PLAIN = "абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя";
const T2A_UPPER_BROKEN = "ÀÁÂÃÄÅœÆÇÈÉÊËÌÍÎÏÐÑÒÓ“ÔÕÖ×ØÙÚÛÜÝÞß";
const T2A_UPPER_PLAIN = "АБВГДЕЁЖЗИЙКЛМНОПРСТУҮФХЦЧШЩЪЫЬЭЮЯ";

const CP1251_SENTENCE_BROKEN =
  "Ìîíãîë Óëñûí ¯íäýñíèé ñòàòèñòèêèéí õîðîî ºíººäºð";
const T2A_SENTENCE_BROKEN =
  "Ìîíãîë Óëñûí “íäýñíèé ñòàòèñòèêèéí õîðîî °í°°ä°ð";
const SENTENCE_PLAIN = "Монгол Улсын Үндэсний статистикийн хороо өнөөдөр";

test("T2A жижиг үсгийн цагаан толгойг бүрэн сэргээнэ", () => {
  assert.equal(decodeWith(T2A_LOWER_BROKEN, "t2a"), T2A_LOWER_PLAIN);
});

test("T2A том үсгийн цагаан толгойг сэргээнэ", () => {
  assert.equal(decodeWith(T2A_UPPER_BROKEN, "t2a"), T2A_UPPER_PLAIN);
});

test("T2A хувилбарыг илрүүлнэ", () => {
  assert.equal(detectVariant(T2A_SENTENCE_BROKEN), "t2a");
});

test("cp1251 хувилбарыг илрүүлнэ", () => {
  assert.equal(detectVariant(CP1251_SENTENCE_BROKEN), "cp1251");
});

test("cp1251 өгүүлбэрийг сэргээнэ", () => {
  const result = repairCyrillicDetailed(CP1251_SENTENCE_BROKEN);
  assert.equal(result.applied, "cp1251");
  assert.equal(result.text, SENTENCE_PLAIN);
});

test("T2A өгүүлбэрийг сэргээнэ", () => {
  const result = repairCyrillicDetailed(T2A_SENTENCE_BROKEN);
  assert.equal(result.applied, "t2a");
  assert.equal(result.text, SENTENCE_PLAIN);
});

test("cp1251 болон T2A хүснэгт хоорондоо холилдохгүй", () => {
  assert.equal(
    decodeWith("\u00AA\u00AF\u00BA\u00BF", "t2a"),
    "\u0404\u0407\u0454\u0457",
  );
  assert.equal(
    decodeWith("\u0090\u201C\u0153\u00B0\u00B3\u00BC", "cp1251"),
    "\u0452\u201C\u045A\u00B0\u0456\u0458",
  );
});

test("эвдэрсэн текст доторх ганц зөв кирилл үсэг хөрвүүлэлтийг зогсоохгүй", () => {
  const result = repairCyrillicDetailed(
    "Ìîíãîë Óëñûí ¯íäýñíèé õîðîî ºíººäºð ёñëýõ",
  );
  assert.equal(result.applied, "cp1251");
  assert.equal(result.text, "Монгол Улсын Үндэсний хороо өнөөдөр ёслэх");
});

test("эвдэрсэн текст доторх зөв кирилл үг хэвээр үлдэнэ", () => {
  const result = repairCyrillicDetailed(
    "Ìîíãîë Óëñûí “íäýñíèé õîðîî °í°°ä°ð Улаанбаатар",
  );
  assert.equal(result.applied, "t2a");
  assert.equal(
    result.text,
    "Монгол Улсын Үндэсний хороо өнөөдөр Улаанбаатар",
  );
});

test("ихэнх нь зөв кирилл бол хөрвүүлэхгүй", () => {
  const text = "Монгол Улсын Үндэсний статистикийн хороо өнөөдөр Ìîíãîë";
  assert.equal(repairCyrillicDetailed(text).applied, "none");
});

test("countMojibakeLetters нь хувилбар тус бүрээр тоолно", () => {
  assert.equal(countMojibakeLetters("Ìîíãîë", "cp1251"), 6);
  assert.equal(countMojibakeLetters("\u00B0\u00B3", "t2a"), 2);
  assert.equal(countMojibakeLetters("\u00B0\u00B3", "cp1251"), 1);
});

test("бүтэн эвдэрсэн үг байхгүй бол хөрвүүлэхгүй", () => {
  const result = repairCyrillicDetailed("1º 2ª 3¿ 25° C");
  assert.equal(result.applied, "none");
  assert.equal(result.text, "1º 2ª 3¿ 25° C");
});

test("кирилл үг доторх нүдийг солино", () => {
  const result = repairCyrillicDetailed("ºнººдºр ¯зэсгэлэн нээгдэнэ");
  assert.equal(result.applied, "slots");
  assert.equal(result.text, "өнөөдөр Үзэсгэлэн нээгдэнэ");
});

test("кирилл үгэнд ороогүй ганц нүдийг хөндөхгүй", () => {
  const text = "Температур 25º, өнцөг 30ª байна";
  assert.equal(repairCyrillic(text), text);
});

test("Є Ї є ї нүднүүдийг кирилл үг дотор солино", () => {
  assert.equal(
    repairCyrillic("\u0454н\u0454\u0454д\u0454р \u0407зэсгэлэн"),
    "өнөөдөр Үзэсгэлэн",
  );
});

test("цэвэр Unicode кирилл текстийг хөндөхгүй", () => {
  const clean = "Шүхэртэй үсрэлтийг загварчлах — тайлан 2026 оны 5 сар";
  assert.equal(repairCyrillic(clean), clean);
});

test("өргөлттэй латин хэлүүдийг хөндөхгүй", () => {
  const samples = [
    "À l'époque où les élèves préféraient étudier à l'étranger, très peu séjournaient.",
    "Über größere Straßen führt der Weg nach München, wo Käse täglich verkauft wird.",
    "El niño pequeño compró jalapeños y piñas en la bodega de la señora Muñoz.",
    "Þórr og Óðinn fóru yfir ána í Þingvöllum þar sem æðarfuglinn syngur á vorin.",
  ];
  for (const sample of samples) {
    assert.equal(repairCyrillic(sample), sample);
  }
});

test("хоосон болон ASCII текстийг хөндөхгүй", () => {
  assert.equal(repairCyrillic(""), "");
  assert.equal(repairCyrillic("plain ascii text"), "plain ascii text");
});

test("charToByte нь cp1252 өндөр тэмдэгтийг байт болгоно", () => {
  assert.equal(charToByte("\u201C"), 0x93);
  assert.equal(charToByte("\u0153"), 0x9c);
  assert.equal(charToByte("\u00B0"), 0xb0);
  assert.equal(charToByte("\u0410"), null);
});

test("countMojibakeWords нь гурваас богино гүйлтийг тоолохгүй", () => {
  assert.equal(countMojibakeWords("àá", "cp1251"), 0);
  assert.equal(countMojibakeWords("àáâ", "cp1251"), 1);
  assert.equal(countMojibakeWords("àáâ ãäå", "cp1251"), 2);
});

test("fixSlotsInWords нь ганцаарчилсан нүдийг үлдээнэ", () => {
  assert.equal(fixSlotsInWords("º ª ¯ ¿"), "º ª ¯ ¿");
  assert.equal(fixSlotsInWords("хºх"), "хөх");
});
