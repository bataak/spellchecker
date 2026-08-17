import { test } from "node:test";
import assert from "node:assert/strict";
import { isDecimalPoint, splitNumberUnit } from "../src/textcheck.ts";

test("бүхэл тоо ба нэгжийг салгана", () => {
  assert.deepEqual(splitNumberUnit("10мг"), { number: "10", unit: "мг" });
  assert.deepEqual(splitNumberUnit("1990онд"), {
    number: "1990",
    unit: "онд",
  });
});

test("аравтын бутархайг таньна", () => {
  assert.deepEqual(splitNumberUnit("7.7мг"), { number: "7.7", unit: "мг" });
  assert.deepEqual(splitNumberUnit("25,5кг"), { number: "25,5", unit: "кг" });
  assert.deepEqual(splitNumberUnit("1.234.567төг"), {
    number: "1.234.567",
    unit: "төг",
  });
});

test("латин нэгжийг мөн таньна", () => {
  assert.deepEqual(splitNumberUnit("10mg"), { number: "10", unit: "mg" });
});

test("үсгээр эхэлсэн үгийг хөндөхгүй", () => {
  assert.equal(splitNumberUnit("COVID19"), null);
  assert.equal(splitNumberUnit("х2"), null);
  assert.equal(splitNumberUnit("мг"), null);
});

test("зөвхөн тооноос бүрдсэн үгийг хөндөхгүй", () => {
  assert.equal(splitNumberUnit("10"), null);
  assert.equal(splitNumberUnit("7.7"), null);
  assert.equal(splitNumberUnit("25,5"), null);
});

test("зураастай хэлбэрийг хөндөхгүй", () => {
  assert.equal(splitNumberUnit("2-р"), null);
  assert.equal(splitNumberUnit("1960-аад"), null);
});

test("тоо дундаа үсэгтэй бол таарахгүй", () => {
  assert.equal(splitNumberUnit("10мг20"), null);
  assert.equal(splitNumberUnit("1а2б"), null);
});

test("нэг үсэгт нэгжийг ч буцаана", () => {
  assert.deepEqual(splitNumberUnit("5м"), { number: "5", unit: "м" });
});

test("хоосон ба тэмдэгттэй оролт", () => {
  assert.equal(splitNumberUnit(""), null);
  assert.equal(splitNumberUnit("10 мг"), null);
  assert.equal(splitNumberUnit("10.мг"), null);
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
