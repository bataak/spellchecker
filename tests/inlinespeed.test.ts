import test from "node:test";
import assert from "node:assert/strict";

import { parseInline } from "../src/markdown.ts";

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
