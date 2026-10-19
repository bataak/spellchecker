import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/markdown.ts";

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
