import { test } from "node:test";
import assert from "node:assert/strict";
import { plainHtml, markedHtml } from "../src/backdrop.ts";

const ZW = "\u200b";

test("plainHtml: төгсгөлийн нэг \\n-ийг хасна (div-ийн блок төгсгөл орлоно)", () => {
  assert.equal(plainHtml("абв\n"), "абв");
});

test("plainHtml: хоосон мөрөөр төгссөн chunk-д hanging guard залгана", () => {
  assert.equal(plainHtml("абв\n\n"), "абв\n" + ZW);
  assert.equal(plainHtml("абв\n\n\n"), "абв\n\n" + ZW);
});

test("plainHtml: зөвхөн \\n агуулсан chunk нэг мөр болно", () => {
  assert.equal(plainHtml("\n"), ZW);
});

test("plainHtml: HTML тэмдэгтүүдийг escape хийнэ", () => {
  assert.equal(plainHtml("<б>&\n"), "&lt;б&gt;&amp;");
});

test("markedHtml: mark зөв байрлалд орно", () => {
  const html = markedHtml("аа хот\n", 100, [
    { word: "хот", start: 103, end: 106 },
  ]);
  assert.equal(html, 'аа <mark data-start="103">хот</mark>');
});

test("markedHtml: хоосон мөрөөр төгссөн chunk-д hanging guard залгана", () => {
  const html = markedHtml("хот\n\n", 0, [{ word: "хот", start: 0, end: 3 }]);
  assert.equal(html, '<mark data-start="0">хот</mark>\n' + ZW);
});
