import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseInline } from "../src/markdown.ts";
import { flatten, isBlank, runsText } from "../src/office/flatten.ts";

const runs = (src: string) => flatten(parseInline(src));

test("энгийн бичвэр нэг гүйлт", () => {
  assert.deepEqual(runs("энгийн бичвэр"), [{ text: "энгийн бичвэр" }]);
});

test("тод хэсгийг тусгаарлана", () => {
  assert.deepEqual(runs("энэ **тод** үг"), [
    { text: "энэ " },
    { text: "тод", bold: true },
    { text: " үг" },
  ]);
});

test("тод доторх налуу хавтгайрна", () => {
  assert.deepEqual(runs("**тод *хоёулаа* тод**"), [
    { text: "тод ", bold: true },
    { text: "хоёулаа", bold: true, italic: true },
    { text: " тод", bold: true },
  ]);
});

test("холбоос доторх тод хоёр шинжийг хадгална", () => {
  assert.deepEqual(runs("[**нэр**](https://bichig.dev)"), [
    { text: "нэр", bold: true, href: "https://bichig.dev" },
  ]);
});

test("мөрийн доторх код mono болно", () => {
  assert.deepEqual(runs("тушаал `hunspell` мөн"), [
    { text: "тушаал " },
    { text: "hunspell", mono: true },
    { text: " мөн" },
  ]);
});

test("ижил хэлбэртэй зэргэлдээ гүйлт нэгдэнэ", () => {
  assert.deepEqual(runs("**нэг****хоёр**"), [{ text: "нэгхоёр", bold: true }]);
});

test("автомат холбоос хаягийг бичвэр болгоно", () => {
  assert.deepEqual(runs("<https://bichig.dev>"), [
    { text: "https://bichig.dev", href: "https://bichig.dev" },
  ]);
});

test("хоосон бичвэр гүйлт үүсгэхгүй", () => {
  assert.deepEqual(runs(""), []);
});

test("runsText цэвэр бичвэр буцаана", () => {
  assert.equal(runsText(runs("энэ **тод** үг")), "энэ тод үг");
});

test("isBlank зөвхөн зайг хоосонд тооцно", () => {
  assert.equal(isBlank(runs("   ")), true);
  assert.equal(isBlank(runs("үг")), false);
  assert.equal(isBlank([]), true);
});

test("гүйлтэд илүү туг наалдахгүй", () => {
  for (const run of runs("энэ **тод** үг")) {
    assert.equal("italic" in run, false);
    assert.equal("mono" in run, false);
    assert.equal("href" in run, false);
  }
});

test("дарлагыг strike туг болгоно", () => {
  assert.deepEqual(runs("энэ ~~хассан~~ үг"), [
    { text: "энэ " },
    { text: "хассан", strike: true },
    { text: " үг" },
  ]);
});

test("дарлага доторх тод хоёуланг хадгална", () => {
  assert.deepEqual(runs("~~**тод**~~"), [
    { text: "тод", bold: true, strike: true },
  ]);
});
