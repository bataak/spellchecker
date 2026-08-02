import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countLines,
  markedHtml,
  plainHtml,
  setLineBlocks,
} from "../src/backdrop.ts";
import type { Token } from "../src/textcheck.ts";

const mark = (start: number, end: number, word = ""): Token =>
  ({ start, end, word }) as Token;

test("plainHtml: логик мөр бүрийг блок болгоно", () => {
  assert.equal(
    plainHtml("нэг\nхоёр"),
    '<div class="bl">нэг</div><div class="bl">хоёр</div>',
  );
});

test("plainHtml: chunk-ийн төгсгөлийн нэг \\n-ийг хасна", () => {
  assert.equal(plainHtml("абв\n"), '<div class="bl">абв</div>');
});

test("plainHtml: хоосон мөрөөр төгссөн chunk хоосон блок үлдээнэ", () => {
  assert.equal(
    plainHtml("абв\n\n"),
    '<div class="bl">абв</div><div class="bl"></div>',
  );
});

test("plainHtml: зөвхөн \\n агуулсан chunk нэг хоосон блок болно", () => {
  assert.equal(plainHtml("\n"), '<div class="bl"></div>');
});

test("plainHtml: хоосон chunk нэг хоосон блок болно", () => {
  assert.equal(plainHtml(""), '<div class="bl"></div>');
});

test("plainHtml: дундах хоосон мөр өөрийн блоктой", () => {
  assert.equal(
    plainHtml("нэг\n\nхоёр"),
    '<div class="bl">нэг</div><div class="bl"></div><div class="bl">хоёр</div>',
  );
});

test("plainHtml: HTML тэмдэгтүүдийг escape хийнэ", () => {
  assert.equal(plainHtml("<б>&"), '<div class="bl">&lt;б&gt;&amp;</div>');
});

test("countLines: chunk дахь логик мөрийн тоог өгнө", () => {
  assert.equal(countLines(""), 1);
  assert.equal(countLines("нэг"), 1);
  assert.equal(countLines("нэг\n"), 1);
  assert.equal(countLines("нэг\nхоёр"), 2);
  assert.equal(countLines("нэг\n\n"), 2);
});

test("markedHtml: mark зөв байрлалд орно", () => {
  assert.equal(
    markedHtml("аа хот", 100, [mark(103, 106)]),
    '<div class="bl">аа <mark data-start="103">хот</mark></div>',
  );
});

test("markedHtml: хоосон мөрөөр төгссөн chunk хоосон блок үлдээнэ", () => {
  assert.equal(
    markedHtml("хот\n\n", 0, [mark(0, 3)]),
    '<div class="bl"><mark data-start="0">хот</mark></div><div class="bl"></div>',
  );
});

test("markedHtml: дараагийн мөрийн mark зөв offset-той", () => {
  assert.equal(
    markedHtml("нэг\nалдаа", 100, [mark(104, 109)]),
    '<div class="bl">нэг</div><div class="bl"><mark data-start="104">алдаа</mark></div>',
  );
});

test("markedHtml: олон мөрийн олон mark", () => {
  assert.equal(
    markedHtml("аа бб\nвв гг", 0, [mark(0, 2), mark(3, 5), mark(6, 8), mark(9, 11)]),
    '<div class="bl"><mark data-start="0">аа</mark> <mark data-start="3">бб</mark></div>' +
      '<div class="bl"><mark data-start="6">вв</mark> <mark data-start="9">гг</mark></div>',
  );
});

test("markedHtml: mark-гүй мөр хэвээр үлдэнэ", () => {
  const html = markedHtml("нэг\nхоёр\nгурав", 0, [mark(9, 14)]);

  assert.ok(html.includes('<div class="bl">нэг</div>'));
  assert.ok(html.includes('<div class="bl">хоёр</div>'));
  assert.ok(html.includes('<mark data-start="9">гурав</mark>'));
});

test("markedHtml: харагдах бичвэр plainHtml-тэй ижил", () => {
  const body = "нэг хоёр\n\nгурав дөрөв\nтав";
  const strip = (html: string): string =>
    html
      .replace(/<div class="bl">/g, "")
      .replace(/<\/div>/g, "\n")
      .replace(/<mark data-start="\d+">/g, "")
      .replace(/<\/mark>/g, "")
      .replace(/\n$/, "");

  assert.equal(strip(markedHtml(body, 0, [mark(0, 3), mark(19, 24)])), body);
  assert.equal(strip(plainHtml(body)), body);
});

test("setLineBlocks(false): хавтгай гаралт буцаана", () => {
  setLineBlocks(false);

  assert.equal(plainHtml("нэг\nхоёр"), "нэг\nхоёр");
  assert.equal(plainHtml("абв\n"), "абв");
  assert.equal(plainHtml("абв\n\n"), "абв\n\u200b");
  assert.equal(plainHtml("\n"), "\u200b");
  assert.equal(
    markedHtml("аа хот", 100, [mark(103, 106)]),
    'аа <mark data-start="103">хот</mark>',
  );

  setLineBlocks(true);
});

test("setLineBlocks(true): блок горим сэргэнэ", () => {
  assert.equal(
    plainHtml("нэг\nхоёр"),
    '<div class="bl">нэг</div><div class="bl">хоёр</div>',
  );
});
