import { test } from "node:test";
import assert from "node:assert/strict";
import { caretLine, statsBody, statsMessage } from "../src/statusline.ts";

const STATS = { words: 1200, bad: 3, chars: 8000 };

test("caretLine: курсорын өмнөх мөр шилжилтийг тоолно", () => {
  assert.equal(caretLine("a\nb\nc", 0), 0);
  assert.equal(caretLine("a\nb\nc", 4), 2);
  assert.equal(caretLine("a\nb", 99), 1);
});

test("statsBody: дэлгэц том үед алдааны тоо, мөр харуулахгүй", () => {
  assert.equal(
    statsBody(STATS, true, { line: 2, total: 5 }),
    "Үгийн тоо: 1,200, Нийт тэмдэгт: 8,000",
  );
});

test("statsBody: гар утсанд алдаа ба мөрийн байрлалыг харуулна", () => {
  assert.equal(
    statsBody(STATS, false, { line: 7, total: 5 }),
    "Үгийн тоо: 1,200, <b>Алдаатай үг</b>: <b>3</b>, Нийт тэмдэгт: 8,000, Мөр: 7 / 7",
  );
  assert.ok(!statsBody(STATS, false, null).includes("Мөр"));
});

test("statsMessage: файлын нэрийг escape хийж нэмнэ", () => {
  assert.equal(statsMessage(null, "body"), "body");
  const html = statsMessage("<a>.docx", "body");
  assert.ok(html.includes('title="&lt;a&gt;.docx"'));
  assert.ok(html.endsWith('<span class="doc-sep">, </span>body</span>'));
});
