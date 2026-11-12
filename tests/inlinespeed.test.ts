import test from "node:test";
import assert from "node:assert/strict";

import { parseInline } from "../src/markdown.ts";
import { splitPipes } from "../src/markdown/inline.ts";

const REPEATS = 32000;
const LIMIT_MS = 1500;

function timed(text: string): number {
  const started = performance.now();
  parseInline(text);
  return performance.now() - started;
}

for (const [name, unit] of [
  ["**", "**a "],
  ["~~", "~~a "],
  ["***", "***a "],
  ["__", "__a__b "],
] as const)
  test(`хаагдаагүй ${name} олон байхад parse удаашрахгүй`, () => {
    assert.ok(timed(unit.repeat(REPEATS)) < LIMIT_MS);
    assert.ok(timed("x" + name + " " + unit.repeat(REPEATS)) < LIMIT_MS);
  });

test("хаагдаагүй тэмдэг дундах онцлол өмнөх шигээ танигдана", () => {
  assert.deepEqual(parseInline("x** **a **b** ~~c"), [
    { type: "text", value: "x** " },
    { type: "strong", children: [{ type: "text", value: "a **b" }] },
    { type: "text", value: " ~~c" },
  ]);
  assert.deepEqual(parseInline("~~a~~ ~~b __c__d __e__"), [
    { type: "del", children: [{ type: "text", value: "a" }] },
    { type: "text", value: " ~~b " },
    { type: "strong", children: [{ type: "text", value: "c__d __e" }] },
  ]);
});

for (const [name, text] of [
  ["\\(", "\\) " + "\\( a ".repeat(REPEATS)],
  ["\\begin{math}", "\\end{math} " + "\\begin{math} a ".repeat(REPEATS)],
  ["[", "[a ".repeat(REPEATS) + "] [b](x)"],
  ["![", "![a ".repeat(REPEATS) + "](x y)"],
] as const)
  test(`хаагдаагүй ${name} олон байхад parse удаашрахгүй`, () => {
    assert.ok(timed(text) < LIMIT_MS);
    const started = performance.now();
    splitPipes(text);
    assert.ok(performance.now() - started < LIMIT_MS);
  });

test("холбоос болохгүй хаалт, хаагдаагүй томьёо бичвэр хэвээр үлдэнэ", () => {
  assert.deepEqual(parseInline("[a [b] `[c` [d](x) \\( e"), [
    { type: "text", value: "[a [b] " },
    { type: "code", value: "[c" },
    { type: "text", value: " " },
    { type: "link", url: "x", children: [{ type: "text", value: "d" }] },
    { type: "text", value: " ( e" },
  ]);
  assert.deepEqual(splitPipes("a \\) b | c \\( d | e \\( f | g \\)"), [
    "a \\) b ",
    " c \\( d | e \\( f | g \\)",
  ]);
  assert.deepEqual(splitPipes("a \\) b | c \\( d | e"), [
    "a \\) b ",
    " c \\( d ",
    " e",
  ]);
});
