import assert from "node:assert/strict";
import { test } from "node:test";

import { tokenize } from "../src/spellchecker.ts";
import { checkable } from "../src/textcheck.ts";

function words(text: string): string[] {
  return [...tokenize(text)].map((token) => token.word);
}

test("keeps an initial joined to the surname", () => {
  assert.deepEqual(words("Ш.ЛХАГВАЖАВ"), ["Ш.ЛХАГВАЖАВ"]);
  assert.deepEqual(words("Ц.Дамдинсүрэн бичсэн"), [
    "Ц.Дамдинсүрэн",
    "бичсэн",
  ]);
});

test("splits an initial that is followed by a space", () => {
  assert.deepEqual(words("Ц. Дамдинсүрэн"), ["Ц", "Дамдинсүрэн"]);
});

test("splits at a sentence ending period", () => {
  assert.deepEqual(words("Энэ өгүүлбэр. Дараа нь"), [
    "Энэ",
    "өгүүлбэр",
    "Дараа",
    "нь",
  ]);
});

test("joins a missing space after a period so the typo is visible", () => {
  assert.deepEqual(words("хийсэн.Дараа нь"), ["хийсэн.Дараа", "нь"]);
});

test("does not swallow an ellipsis", () => {
  assert.deepEqual(words("Үг гэсэн... дараа"), ["Үг", "гэсэн", "дараа"]);
});

test("keeps abbreviations together", () => {
  assert.deepEqual(words("т.м гэх мэт"), ["т.м", "гэх", "мэт"]);
});

test("keeps a soft hyphenated word together", () => {
  assert.deepEqual(
    words("\u0441\u0438\u043c\u0443\u00ad\u043b\u044f\u0446\u0438"),
    ["\u0441\u0438\u043c\u0443\u00ad\u043b\u044f\u0446\u0438"],
  );
});

test("keeps a suffix attached after a dash", () => {
  assert.deepEqual(words("2\u20138-ны өдрүүдэд"), [
    "2\u20138-ны",
    "өдрүүдэд",
  ]);
});

test("skips dotted numbers and dates", () => {
  for (const value of ["2.5", "08.02", "2026.08.02-нд", "1.3.3-аас"]) {
    assert.equal(checkable(value), false, value);
  }
});

test("still checks words that merely contain digits", () => {
  assert.equal(checkable("A4"), true);
  assert.equal(checkable("2\u20138-ны"), true);
  assert.equal(checkable("Ш.ЛХАГВАЖАВ"), true);
});

test("drops a trailing apostrophe or closing quote", () => {
  assert.deepEqual(words("тухай\u2019\u2019"), ["тухай"]);
  assert.deepEqual(words("\u2019\u2019тухай\u2019\u2019"), ["тухай"]);
  assert.deepEqual(words("тухай\u2019 гэсэн"), ["тухай", "гэсэн"]);
  assert.deepEqual(words("\u201cтухай\u201d"), ["тухай"]);
});

test("keeps an apostrophe that sits between letters", () => {
  assert.deepEqual(words("don't stop"), ["don't", "stop"]);
  assert.deepEqual(words("O'Brien"), ["O'Brien"]);
});

test("drops a straight apostrophe at the end too", () => {
  assert.deepEqual(words("тухай' гэсэн"), ["тухай", "гэсэн"]);
});
