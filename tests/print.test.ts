import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { docImages, imageKey } from "../src/office/docir.ts";
import { printHtml, splitStyles } from "../src/office/print.ts";
import { findTemplate } from "../src/templates.ts";

function letter(md: string): string {
  const template = findTemplate("letter")!;
  return printHtml(applyTemplate(parse(md), template));
}

test("printHtml: өргөдлийн гарчиг мөр таслалттайгаар Title загвартай гарна", () => {
  const html = letter("# Тэнхимд\\\nӨргөдөл гаргах нь:\n\nБие.");
  assert.match(html, /<p class="s-Title">Тэнхимд<br>Өргөдөл гаргах нь:<\/p>/);
  assert.match(html, /<title>Тэнхимд Өргөдөл гаргах нь:<\/title>/);
  assert.match(
    html,
    /@page\{size:21\.000cm 29\.700cm;margin:0\}/,
  );
  assert.match(html, /body\{padding:0 1\.500cm 0 3\.000cm;/);
  assert.match(html, /\.sheet>thead>tr>td\{height:2\.000cm\}/);
  assert.match(html, /\.sheet>tfoot>tr>td\{height:2\.000cm\}/);
  assert.match(html, /<body><table class="sheet"><thead>/);
  assert.doesNotMatch(html, /@bottom-center/);
});

test("printHtml: хүснэгт, жагсаалт, тэмдэгт", () => {
  const html = letter(
    "# А\n\n## Б\n\n- **нэг** <x>\n- хоёр\n\n| а | б |\n| - | -: |\n| 1 | 2 |",
  );
  assert.doesNotMatch(html, /@bottom-center/);
  assert.match(
    html,
    /<ul><li><p class="s-ListItem"><b>нэг<\/b> &lt;x&gt;<\/p><\/li>/,
  );
  assert.match(html, /<td class="c-head">/);
  assert.match(
    html,
    /<td class="c-last"><p class="s-TableCell" data-style="text-align:right">2<\/p><\/td>/,
  );
});

test("printHtml: гарын үсгийн зураасны доор тайлбар гарна", () => {
  const html = letter(
    "Бие.\n\n::: {.signature}\n| | |\n| -: | :- |\n| Хүлээн авсан: | ____ (нэр, албан тушаал, огноо) |\n:::",
  );
  assert.match(
    html,
    /<span class="fill"><\/span><br>\(нэр, албан тушаал, огноо\)<\/p>/,
  );
});

test("printHtml: хуудас таслалт", () => {
  assert.match(letter("А\n\n\\newpage\n\nБ"), /<p class="page-break"><\/p>/);
});

test("printHtml: бэлтгэсэн зургийг голлуулсан догол болгон гаргана", () => {
  const template = findTemplate("letter")!;
  const doc = applyTemplate(
    parse("Хавсралт:\n\n![](id.jpg){width=60% rotate=90}\n\n![](x.png)"),
    template,
  );
  const [shown, missing] = docImages(doc);
  assert.deepEqual(shown, { src: "id.jpg", widthPercent: 60, rotate: 90 });
  const images = new Map([
    [
      imageKey(shown!),
      { url: "blob:id", blob: null, widthPx: 300, heightPx: 400 },
    ],
  ]);
  const html = printHtml(doc, "fonts/", images);
  assert.match(
    html,
    /<p class="s-Figure"><img class="image" src="blob:id" alt="" data-style="width:60%"><\/p>/,
  );
  assert.equal(missing?.src, "x.png");
  assert.match(html, /<p class="s-Figure"><br><\/p>/);
});

test("printHtml: хэвлэлт апптай хамт ирсэн Times-тэй ижил өргөнтэй фонтыг эхэлж ашиглана", () => {
  const html = letter("Бие.");
  assert.match(html, /body\{[^}]*font-family:"Bichig Print Serif", "Times New Roman"/);
  assert.match(html, /\.mono\{font-family:"Bichig Print Mono"/);
  for (const file of [
    "bichig-print-serif-mn-400-v1",
    "bichig-print-serif-mn-700-v1",
    "bichig-print-serif-mn-400i-v1",
    "bichig-print-serif-mn-700i-v1",
    "bichig-print-mono-mn-400-v1",
    "bichig-print-mono-mn-700-v1",
    "bichig-print-mono-mn-400i-v1",
    "bichig-print-mono-mn-700i-v1",
  ])
    assert.ok(html.includes('url("fonts/' + file + '.woff2")'), file);
});

test("splitStyles: CSS-ийг баримтаас салгаж, style блокгүй markup буцаана", () => {
  const { markup, css } = splitStyles(letter("# Гарчиг\n\nБие."));
  assert.doesNotMatch(markup, /<style>|<\/style>/);
  assert.match(markup, /<title>Гарчиг<\/title><\/head><body>/);
  assert.match(css, /@page\{/);
  assert.deepEqual(splitStyles("<p>a</p>"), { markup: "<p>a</p>", css: "" });
});
