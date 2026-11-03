import test from "node:test";
import assert from "node:assert/strict";

import { hexOf } from "../src/core/hex.ts";

test("hexOf: байт бүрийг хоёр оронтой бичнэ", () => {
  assert.equal(hexOf(new Uint8Array([0, 10, 255])), "000aff");
  assert.equal(hexOf(new Uint8Array([1, 2]).buffer), "0102");
  assert.equal(hexOf(new Uint8Array()), "");
});
