import { test } from "node:test";
import assert from "node:assert/strict";
import { stripInvisible } from "../src/office/sanitize.ts";

test("NUL тэмдэгтийг хасна", () => {
  assert.equal(stripInvisible("\u0000 f(x 1"), " f(x 1");
  assert.equal(stripInvisible("а\u0000б"), "аб");
});

test("C0 удирдах тэмдэгтүүдийг хасна", () => {
  assert.equal(stripInvisible("а\u0001\u0002\u0003б"), "аб");
  assert.equal(stripInvisible("а\u0008б\u000Bв\u000Cг"), "абвг");
  assert.equal(stripInvisible("а\u000E\u0015\u001Fб"), "аб");
});

test("мөр таслалт ба таб хэвээр үлдэнэ", () => {
  assert.equal(stripInvisible("а\nб"), "а\nб");
  assert.equal(stripInvisible("а\tб"), "а\tб");
  assert.equal(stripInvisible("а\n\n\tб"), "а\n\n\tб");
});

test("DEL ба C1 тэмдэгтүүдийг хасна", () => {
  assert.equal(stripInvisible("а\u007Fб"), "аб");
  assert.equal(stripInvisible("а\u0085б"), "аб");
  assert.equal(stripInvisible("а\u0080\u009Fб"), "аб");
});

test("U+2028, U+2029-ыг хасна", () => {
  assert.equal(stripInvisible("а\u2028б"), "аб");
  assert.equal(stripInvisible("а\u2029б"), "аб");
});

test("кирилл, латин, математик тэмдэгт хөндөгдөхгүй", () => {
  const text = "Φ(y) ⩽ ψ(y), интеграл — 25.11 «ε − δ» \u00AD\u200B";
  assert.equal(stripInvisible(text), text);
});

test("цэвэр текст өөрчлөгдөхгүй", () => {
  assert.equal(stripInvisible(""), "");
  assert.equal(stripInvisible("а б в"), "а б в");
});

test("зөвхөн удирдах тэмдэгтээс бүрдсэн мөр хоосон болно", () => {
  assert.equal(stripInvisible("\u0000\u0001\u0002"), "");
});
