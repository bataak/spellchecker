import "./helpers/mock-storage.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeImport } from "../src/ignorelist.js";
import { tokenize } from "../src/spellchecker.js";

test("normalizeImport: кирилл үгийг зөвшөөрнө", () => {
  assert.equal(normalizeImport("тест"), "тест");
  assert.equal(normalizeImport("  Улаанбаатар  "), "Улаанбаатар");
  assert.equal(normalizeImport("ТЕГ-аас"), "ТЕГ-аас");
});

test("normalizeImport: кирилл үгт орсон хашилт хасагдана", () => {
  assert.equal(normalizeImport("тэ'ст"), "тэст");
});

test("normalizeImport: латин үгт хашилт хасагдахгүй", () => {
  assert.equal(normalizeImport("don't"), "don't");
  assert.equal(normalizeImport("word"), "word");
});

test("normalizeImport: буруу оролтод null", () => {
  for (const w of ["", "  ", "а", "x", "мон123", "test123", "юм?"]) {
    assert.equal(normalizeImport(w), null, JSON.stringify(w));
  }
});

test("tokenize: үгсийг байрлалаар нь ялгана", () => {
  const tokens = [...tokenize("нэг хоёр")];
  assert.deepEqual(tokens, [
    { word: "нэг", index: 0 },
    { word: "хоёр", index: 4 },
  ]);
});

test("tokenize: зураастай үгийг бүтнээр нь авна", () => {
  const tokens = [...tokenize("ТЕГ-аас ирэв")];
  assert.equal(tokens[0].word, "ТЕГ-аас");
});

test("tokenize: цэг таслалаар зааглагдана", () => {
  const words = [...tokenize("нэг, хоёр. гурав!")].map((t) => t.word);
  assert.deepEqual(words, ["нэг", "хоёр", "гурав"]);
});

test("tokenize: тоо болон холимог токен", () => {
  const words = [...tokenize("50-ны 12 5а")].map((t) => t.word);
  assert.deepEqual(words, ["50-ны", "12", "5а"]);
});

test("tokenize: хоосон бичвэрээс юу ч буцахгүй", () => {
  assert.deepEqual([...tokenize("")], []);
  assert.deepEqual([...tokenize("  ... !")], []);
});
