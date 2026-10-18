import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDecimalPoint,
  nextOccurrence,
  splitNumberBoundary,
} from "../src/spell/textcheck.ts";

test("бүхэл тоо ба нэгжийг салгана", () => {
  assert.deepEqual(splitNumberBoundary("10мг"), {
    word: "мг",
    split: "10 мг",
  });
  assert.deepEqual(splitNumberBoundary("1990онд"), {
    word: "онд",
    split: "1990 онд",
  });
});

test("аравтын бутархайг таньна", () => {
  assert.deepEqual(splitNumberBoundary("7.7мг"), {
    word: "мг",
    split: "7.7 мг",
  });
  assert.deepEqual(splitNumberBoundary("25,5кг"), {
    word: "кг",
    split: "25,5 кг",
  });
  assert.deepEqual(splitNumberBoundary("1.234.567төг"), {
    word: "төг",
    split: "1.234.567 төг",
  });
});

test("латин нэгжийг мөн таньна", () => {
  assert.deepEqual(splitNumberBoundary("10mg"), {
    word: "mg",
    split: "10 mg",
  });
});

test("кирилл үг ба тоо наалдсаныг салгана", () => {
  assert.deepEqual(splitNumberBoundary("оруулалтаар19"), {
    word: "оруулалтаар",
    split: "оруулалтаар 19",
  });
  assert.deepEqual(splitNumberBoundary("Оруулалтаар19"), {
    word: "Оруулалтаар",
    split: "Оруулалтаар 19",
  });
  assert.deepEqual(splitNumberBoundary("тун7.7"), {
    word: "тун",
    split: "тун 7.7",
  });
});

test("латин үгээр эхэлсэн бол хөндөхгүй", () => {
  assert.equal(splitNumberBoundary("COVID19"), null);
  assert.equal(splitNumberBoundary("MP3"), null);
  assert.equal(splitNumberBoundary("Windows11"), null);
});

test("үсэггүй буюу тоогүй үгийг хөндөхгүй", () => {
  assert.equal(splitNumberBoundary("мг"), null);
  assert.equal(splitNumberBoundary("10"), null);
  assert.equal(splitNumberBoundary("7.7"), null);
  assert.equal(splitNumberBoundary("25,5"), null);
});

test("зураастай хэлбэрийг хөндөхгүй", () => {
  assert.equal(splitNumberBoundary("2-р"), null);
  assert.equal(splitNumberBoundary("1960-аад"), null);
  assert.equal(splitNumberBoundary("оруулалтаар-19"), null);
});

test("тоо дундаа үсэгтэй бол таарахгүй", () => {
  assert.equal(splitNumberBoundary("10мг20"), null);
  assert.equal(splitNumberBoundary("1а2б"), null);
  assert.equal(splitNumberBoundary("оруулалтаар19хувь"), null);
});

test("богино хэсгийг ч буцаана, шүүлт нь checkable дээр", () => {
  assert.deepEqual(splitNumberBoundary("5м"), { word: "м", split: "5 м" });
  assert.deepEqual(splitNumberBoundary("х2"), { word: "х", split: "х 2" });
});

test("хоосон ба тэмдэгттэй оролт", () => {
  assert.equal(splitNumberBoundary(""), null);
  assert.equal(splitNumberBoundary("10 мг"), null);
  assert.equal(splitNumberBoundary("10.мг"), null);
  assert.equal(splitNumberBoundary("оруулалтаар 19"), null);
});

test("аравтын цэгийг таньж хуваалтын цэг гэж үзэхгүй", () => {
  assert.equal(isDecimalPoint("7", "7мг"), true);
  assert.equal(isDecimalPoint("1.234", "567төг"), true);
  assert.equal(isDecimalPoint("3", "14"), true);
});

test("нэрийн товчлол ба жагсаалтын цэг хуваалт хэвээр", () => {
  assert.equal(isDecimalPoint("А", "Б.Иванов"), false);
  assert.equal(isDecimalPoint("1", "Монгол"), false);
  assert.equal(isDecimalPoint("үг", "2"), false);
  assert.equal(isDecimalPoint("", "5"), false);
  assert.equal(isDecimalPoint("5", ""), false);
});

test("ижил алдаатай үгийн чип давталтуудаар ээлжлэн шилжинэ", () => {
  const tokens = [
    { word: "mmsm", start: 0, end: 4 },
    { word: "алдаатй", start: 5, end: 12 },
    { word: "Mmsm", start: 13, end: 17 },
    { word: "mmsm", start: 18, end: 22 },
  ];
  const pick = (start: number, end: number) =>
    nextOccurrence(tokens, 0, { start, end })?.start;
  assert.equal(pick(30, 30), 0);
  assert.equal(pick(0, 4), 13);
  assert.equal(pick(13, 17), 18);
  assert.equal(pick(18, 22), 0);
  assert.equal(nextOccurrence(tokens, 99, { start: 0, end: 0 }), undefined);
});
