import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSavedScroll } from "../src/toolbar.ts";

test("хадгалсан цэсийн байрлалыг уншина", () => {
  assert.equal(parseSavedScroll("240"), 240);
  assert.equal(parseSavedScroll("0"), 0);
  assert.equal(parseSavedScroll("12.6"), 13);
});

test("буруу утгыг үл тооно", () => {
  assert.equal(parseSavedScroll(null), null);
  assert.equal(parseSavedScroll(""), null);
  assert.equal(parseSavedScroll("abc"), null);
  assert.equal(parseSavedScroll("-5"), null);
});
