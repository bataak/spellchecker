import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../src/markdown.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { printHtml } from "../src/office/print.ts";
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
    /@page\{size:21\.000cm 29\.700cm;margin:2\.000cm 1\.500cm 2\.000cm 3\.000cm\}/,
  );
  assert.doesNotMatch(html, /@bottom-center/);
});

test("printHtml: хүснэгт, жагсаалт, тэмдэгт", () => {
  const html = letter(
    "# А\n\n## Б\n\n- **нэг** <x>\n- хоёр\n\n| а | б |\n| - | -: |\n| 1 | 2 |",
  );
  assert.match(html, /@bottom-center\{content:counter\(page\)/);
  assert.match(
    html,
    /<ul><li><p class="s-ListItem"><b>нэг<\/b> &lt;x&gt;<\/p><\/li>/,
  );
  assert.match(html, /<td class="c-head">/);
  assert.match(
    html,
    /<td class="c-last"><p class="s-TableCell" style="text-align:right">2<\/p><\/td>/,
  );
});
