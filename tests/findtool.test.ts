import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceShown, visibleBand } from "../src/editor/findtool.ts";

test("replaceShown нуухаар хадгалаагүй бол солих мөрийг харуулна", () => {
  assert.equal(replaceShown(null), true);
  assert.equal(replaceShown("1"), true);
  assert.equal(replaceShown("0"), false);
});

const rect = (left: number, top: number, right: number, bottom: number) =>
  ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }) as DOMRect;

test("visibleBand хайх цонхны халхалсан хэсгийг хасна", () => {
  const box = rect(0, 100, 400, 700);
  assert.deepEqual(visibleBand(box, null), { top: 100, bottom: 700 });
  assert.deepEqual(visibleBand(box, rect(0, 80, 390, 220)), {
    top: 220,
    bottom: 700,
  });
  assert.deepEqual(visibleBand(box, rect(0, 560, 390, 690)), {
    top: 100,
    bottom: 560,
  });
  assert.deepEqual(visibleBand(box, rect(250, 80, 400, 220)), {
    top: 100,
    bottom: 700,
  });
});
