import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { deckDoc } from "../src/office/deck.ts";
import { deckPrintHtml } from "../src/office/deckprint.ts";
import { splitSlides } from "../src/doc/slides.ts";

function deck(md: string): string {
  return deckPrintHtml(deckDoc(splitSlides(parse(md))));
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

test("deckPrintHtml: босоо A4 хуудас бүрд 2 слайд", () => {
  const html = deck(
    "---\ntitle: Илтгэл\n---\n\n## Нэг\n\nА\n\n## Хоёр\n\nБ\n\n## Гурав\n\nВ\n\n## Дөрөв\n\nГ\n",
  );
  assert.match(html, /@page\{size:21\.000cm 29\.700cm;margin:1\.500cm\}/);
  assert.equal(count(html, /class="frame"/g), 5);
  assert.equal(count(html, /<section class="page">/g), 3);
  assert.match(html, /<title>Илтгэл<\/title>/);
  const pages = html.split('<section class="page">').slice(1);
  assert.deepEqual(
    pages.map((page) => count(page, /class="frame"/g)),
    [2, 2, 1],
  );
});

test("deckPrintHtml: нүүр, жагсаалт, дугаар, хүснэгт", () => {
  const html = deck(
    "---\ntitle: Гарчиг\nauthor: Бат\n---\n\n## Слайд\n\n- нэг\n- **хоёр**\n\n3. гурав\n4. дөрөв\n\n| а | б |\n| - | -: |\n| 1 | 2 |\n",
  );
  assert.match(html, /font-size:36pt;text-align:center"><b>Гарчиг<\/b>/);
  assert.match(html, /font-size:20pt;text-align:center">Бат<\/p>/);
  assert.match(html, /<span class="mk">•<\/span>нэг/);
  assert.match(html, /<span class="mk">•<\/span><b>хоёр<\/b>/);
  assert.match(html, /<span class="mk">3\.<\/span>гурав/);
  assert.match(html, /<span class="mk">4\.<\/span>дөрөв/);
  assert.match(html, /<tr[^>]*><td[^>]*class="h e-t2 e-b1"><b>а<\/b>/);
  assert.match(html, /td\.e-t2\{border-top:1\.5pt solid #000\}/);
  assert.match(html, /text-align:right"[^>]*>2<\/td>/);
});

test("deckPrintHtml: илтгэгчийн тэмдэглэл хэвлэгдэхгүй", () => {
  const html = deck("## Слайд\n\nТекст\n\n::: notes\nНууц\n:::\n");
  assert.match(html, /Текст/);
  assert.doesNotMatch(html, /Нууц/);
});

test("deckPrintHtml: слайд аптай хамт ирсэн Arial-тай ижил өргөнтэй фонтыг эхэлж ашиглана", () => {
  const html = deck("# Слайд\n\nТекст.");
  assert.match(html, /body\{font-family:"Bichig Print Sans", Arial/);
  assert.ok(html.includes('url("fonts/bichig-print-sans-mn-400-v1.woff2")'));
});
