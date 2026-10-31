import test from "node:test";
import assert from "node:assert/strict";

import { format, parse } from "../src/markdown.ts";

test("parse: ишлэлийн мөр U+2028-аар төгсвөл гацахгүй", () => {
  for (const text of [">  ", "> а ", "> а \n> б", "# г\n\n> "]) {
    const blocks = parse(text);
    assert.equal(blocks.at(-1)?.type, "quote", JSON.stringify(text));
  }
});

test("parse: олон хаагаагүй томьёо нээгч шугаман хугацаанд задлагдана", () => {
  for (const unit of ["$$x\n", "\\[x\n"]) {
    const text = unit.repeat(6000);
    const started = performance.now();
    const blocks = parse(text);
    assert.ok(performance.now() - started < 2000, unit);
    assert.ok(blocks.length > 0);
  }
});

test("format: хаагаагүй олон [ бүхий догол шугаман хугацаанд цэгцлэгдэнэ", () => {
  for (const unit of ["\\[x\n", "[x\n", "![x\n"]) {
    const text = unit.repeat(12000);
    const started = performance.now();
    format(text);
    assert.ok(performance.now() - started < 2000, unit);
  }
  assert.equal(format("[a](b) ба [c\n"), format(format("[a](b) ба [c\n")));
});

test("parse: баганын тоо таарахгүй тусгаарлагч хүснэгт үүсгэхгүй", () => {
  assert.deepEqual(
    parse("Сонголт: a | b\n---\nДараах мөр.").map((b) => b.type),
    ["paragraph", "rule", "paragraph"],
  );
  assert.equal(parse("| a | b |\n|---|---|\n| 1 | 2 |")[0]?.type, "table");
});

test("parse: код, томьёо доторх | хүснэгтийн нүдийг хуваахгүй", () => {
  for (const text of [
    "| $|x|$ | y |\n|---|---|\n| 1 | 2 |",
    "| `a|b` | c |\n|---|---|\n| 1 | 2 |",
    "| a \\| b | c |\n|---|---|\n| 1 | 2 |",
  ]) {
    const [table] = parse(text);
    assert.equal(table?.type, "table", text);
    assert.equal(table?.type === "table" && table.rows[0]?.length, 2, text);
  }
  const [open] = parse("| `a | b |\n|---|---|\n| 1 | 2 |");
  assert.equal(open?.type === "table" && open.rows[0]?.length, 2);
});
