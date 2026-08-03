import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCase,
  caseRank,
  casePattern,
  irregularCase,
  rankToPattern,
} from "../src/caseform.ts";

test("casePattern: жижиг үсгийн үг", () => {
  assert.equal(casePattern("монгол"), "lower");
});

test("casePattern: том үсгээр эхэлсэн үг", () => {
  assert.equal(casePattern("Монгол"), "capital");
});

test("casePattern: бүхэлдээ том үсэг", () => {
  assert.equal(casePattern("МОНГОЛ"), "upper");
});

test("casePattern: хоосон мөр жижиг гэж тооцогдоно", () => {
  assert.equal(casePattern(""), "lower");
});

test("casePattern: үсэггүй тэмдэгт жижиг гэж тооцогдоно", () => {
  assert.equal(casePattern("123-456"), "lower");
});

test("casePattern: том үсэг олонхи байвал upper", () => {
  assert.equal(casePattern("МОНГОЛулс"), "upper");
});

test("casePattern: жижиг олонхи, эхнийх нь том бол capital", () => {
  assert.equal(casePattern("Монголулс"), "capital");
});

test("casePattern: жижиг олонхи, эхнийх нь жижиг бол lower", () => {
  assert.equal(casePattern("монголУ"), "lower");
});

test("casePattern: тоогоор эхэлсэн том үсэгт үг", () => {
  assert.equal(casePattern("2-Р"), "upper");
});

test("applyCase: жижиг болгоно", () => {
  assert.equal(applyCase("lower", "МОНГОЛ"), "монгол");
});

test("applyCase: том болгоно", () => {
  assert.equal(applyCase("upper", "монгол"), "МОНГОЛ");
});

test("applyCase: эхний үсгийг том болгоно", () => {
  assert.equal(applyCase("capital", "МОНГОЛ"), "Монгол");
});

test("applyCase: capital хэлбэр үлдсэн үсгийг жижиг болгоно", () => {
  assert.equal(applyCase("capital", "мОнГоЛ"), "Монгол");
});

test("applyCase: хоосон мөр хэвээр үлдэнэ", () => {
  assert.equal(applyCase("capital", ""), "");
});

test("casePattern → applyCase round-trip хэлбэрийг хадгална", () => {
  for (const word of ["монгол", "Монгол", "МОНГОЛ"]) {
    assert.equal(applyCase(casePattern(word), word), word);
  }
});

test("irregularCase: жирийн хэлбэрүүдэд false", () => {
  assert.equal(irregularCase("монгол"), false);
  assert.equal(irregularCase("Монгол"), false);
  assert.equal(irregularCase("МОНГОЛ"), false);
});

test("irregularCase: холимог хэлбэрт true", () => {
  assert.equal(irregularCase("мОнГоЛ"), true);
});

test("irregularCase: хоосон мөрд false", () => {
  assert.equal(irregularCase(""), false);
});

test("caseRank: эрэмбэ lower < capital < upper", () => {
  assert.ok(caseRank("lower") < caseRank("capital"));
  assert.ok(caseRank("capital") < caseRank("upper"));
});

test("caseRank → rankToPattern round-trip", () => {
  for (const pattern of ["lower", "capital", "upper"] as const) {
    assert.equal(rankToPattern(caseRank(pattern)), pattern);
  }
});

test("rankToPattern: танихгүй утгад lower", () => {
  assert.equal(rankToPattern(9), "lower");
  assert.equal(rankToPattern(-1), "lower");
});
