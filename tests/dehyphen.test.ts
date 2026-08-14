import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dehyphenateLines,
  isSoftHyphenBreak,
} from "../src/office/pdf/dehyphen.ts";

test("кирилл жижиг үсэг хоорондын зураасыг арилгаж нийлүүлнэ", () => {
  assert.deepEqual(
    dehyphenateLines(["Хавтасны нүүр зур-", "гийг Брайан Виссман."]),
    ["Хавтасны нүүр зургийг", "Брайан Виссман."],
  );
});

test("цэг таслал дагасан ч нийлүүлнэ", () => {
  assert.deepEqual(dehyphenateLines(["бэлтгэг-", "дэн, судалгаа"]), [
    "бэлтгэгдэн,",
    "судалгаа",
  ]);
});

test("ө, ү, ё үсгийг таньна", () => {
  assert.deepEqual(dehyphenateLines(["дө-", "рөөнд"]), ["дөрөөнд", ""]);
  assert.deepEqual(dehyphenateLines(["хүүхдүү-", "дээ"]), ["хүүхдүүдээ", ""]);
});

test("том үсгээр төгссөн товчлолын зураасыг хадгална", () => {
  assert.deepEqual(dehyphenateLines(["МУИС-", "ийн багш"]), [
    "МУИС-",
    "ийн багш",
  ]);
});

test("тооны дараах зураасыг хадгална", () => {
  assert.deepEqual(dehyphenateLines(["1960-", "аад он"]), ["1960-", "аад он"]);
  assert.deepEqual(dehyphenateLines(["§1.5-", "д заасан"]), [
    "§1.5-",
    "д заасан",
  ]);
});

test("латин үсгийн зураасыг хадгална", () => {
  assert.deepEqual(dehyphenateLines(["KOMA-", "Script багц"]), [
    "KOMA-",
    "Script багц",
  ]);
});

test("хаалт, томьёоны дараах зураасыг хадгална", () => {
  assert.deepEqual(dehyphenateLines(["f(x)-", "ийн утга"]), [
    "f(x)-",
    "ийн утга",
  ]);
  assert.deepEqual(dehyphenateLines(["(3.9)-", "оос гарна"]), [
    "(3.9)-",
    "оос гарна",
  ]);
});

test("дараагийн мөр том үсэг, тоо, тэмдэгтээр эхэлбэл хөндөхгүй", () => {
  assert.deepEqual(dehyphenateLines(["Матема-", "1"]), ["Матема-", "1"]);
  assert.deepEqual(dehyphenateLines(["хэрч-", "\u221A"]), ["хэрч-", "\u221A"]);
  assert.deepEqual(dehyphenateLines(["илэр-", "P1"]), ["илэр-", "P1"]);
});

test("хоосон мөрийг алгасаж нийлүүлнэ", () => {
  assert.deepEqual(dehyphenateLines(["интегралч-", "", "  ", "лах арга"]), [
    "интегралчлах",
    "",
    "  ",
    "арга",
  ]);
});

test("сүүлийн мөрийн зураасыг хөндөхгүй", () => {
  assert.deepEqual(dehyphenateLines(["төгсгөл-"]), ["төгсгөл-"]);
});

test("зөөлөн зураас (U+00AD) болон U+2010-ыг мөн таньна", () => {
  assert.deepEqual(dehyphenateLines(["сур\u00AD", "гуульдаа"]), [
    "сургуульдаа",
    "",
  ]);
  assert.deepEqual(dehyphenateLines(["сур\u2010", "гуульдаа"]), [
    "сургуульдаа",
    "",
  ]);
});

test("дараалсан хоёр таслалтыг нийлүүлнэ", () => {
  assert.deepEqual(dehyphenateLines(["ма-", "тема-", "тикчдын арга"]), [
    "математикчдын",
    "",
    "арга",
  ]);
});

test("isSoftHyphenBreak-ийн хилийн тохиолдол", () => {
  assert.equal(isSoftHyphenBreak("", "гийг"), false);
  assert.equal(isSoftHyphenBreak("зур", ""), false);
  assert.equal(isSoftHyphenBreak("зур", "   гийг"), true);
});
