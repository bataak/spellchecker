import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { findTemplate } from "../src/doc/templates.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { printHtml } from "../src/office/print.ts";

const doc = (md: string) => applyTemplate(parse(md), findTemplate("report")!);
const part = (bytes: Uint8Array, name: string): string =>
  strFromU8(unzipSync(bytes)[name]!);
const docxBody = (md: string): string =>
  part(buildDocx(doc(md), { toc: false }), "word/document.xml");
const odtBody = (md: string): string =>
  part(buildOdt(doc(md), { toc: false }), "content.xml");

const QUOTED_CODE = "# Т\n\n> ```\n> нэг\n>   хоёр\n> ```\n";
const INLINE = '# Т\n\nАа `x = "a"` "б".\n';

test("кодын хашилт Word, ODT, хэвлэлд өөрчлөгдөхгүй", () => {
  for (const body of [docxBody(INLINE), odtBody(INLINE)]) {
    assert.ok(
      body.includes("x = &quot;a&quot;") || body.includes('x = "a"'),
      body,
    );
    assert.ok(body.includes("«б»"), body);
    assert.ok(!body.includes("«a»"), body);
  }
  const html = printHtml(doc(INLINE));
  assert.ok(!html.includes("«a»"), html);
  assert.ok(html.includes("«б»"), html);
});

test("ишлэл доторх код Word дээр мөрөө хадгална", () => {
  const body = docxBody(QUOTED_CODE);
  assert.match(body, /нэг<\/w:t>.*<w:br\/>.*хоёр/s);
});

test("ишлэл доторх код ODT дээр мөрөө хадгална", () => {
  const body = odtBody(QUOTED_CODE);
  assert.match(
    body,
    /нэг.*<text:line-break\/>.*<text:s\/> ?хоёр|нэг.*<text:line-break\/>.*хоёр/s,
  );
});

test("кодын блок хэвлэлд мөр ба догол хадгална", () => {
  for (const md of [QUOTED_CODE, "# Т\n\n```\nнэг\n  хоёр\n```\n"]) {
    const html = printHtml(doc(md));
    assert.match(
      html,
      /<p class="[^"]* verbatim">.*нэг.*<br>.* {2}хоёр.*<\/p>/s,
    );
    assert.ok(html.includes(".verbatim{white-space:pre-wrap}"));
  }
});

test("энгийн ишлэл мөр нэмэхгүй", () => {
  const md = "# Т\n\n> нэг **хоёр**\n";
  assert.doesNotMatch(docxBody(md), /<w:br\/>/);
  assert.doesNotMatch(odtBody(md), /<text:line-break\/>/);
  assert.doesNotMatch(printHtml(doc(md)), /verbatim">/);
});
