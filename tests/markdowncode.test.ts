import test from "node:test";
import assert from "node:assert/strict";

import { parse, toHtml } from "../src/markdown.ts";

test("кодын блок — info string-тэй мөр блокийг хаахгүй", () => {
  const blocks = parse("```python\nа\n```python\nб\n```\n\nдогол\n");
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["codeblock", "paragraph"],
  );
  assert.equal((blocks[0] as { value: string }).value, "а\n```python\nб");
});

test("кодын блок — урт fence-ийг богино fence хаахгүй", () => {
  const blocks = parse("````\nа\n```\nб\n````\n");
  assert.equal(blocks.length, 1);
  assert.equal((blocks[0] as { value: string }).value, "а\n```\nб");
});

test("inline код — дотор нь backslash escape ажиллахгүй, хаах backtick хэвээр", () => {
  const html = (src: string) =>
    toHtml(parse(src))
      .replace(/<p[^>]*>|<\/p>/g, "")
      .trim();
  assert.equal(html("`run.bat\\`"), "<code>run.bat\\</code>");
  assert.equal(html("`a\\`b` дараа"), "<code>a\\</code>b` дараа");
  assert.equal(html("``a\\``"), "<code>a\\</code>");
  assert.equal(html("`a\\*b`"), "<code>a\\*b</code>");
  assert.equal(html("\\`энгийн\\`"), "`энгийн`");
  assert.equal(html("`нэг` ба \\*од\\*"), "<code>нэг</code> ба *од*");
});
