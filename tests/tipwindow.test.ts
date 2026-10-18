import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePin } from "../src/tipwindow.ts";

test("parsePin хадгалсан байрлалыг уншина", () => {
  assert.deepEqual(parsePin("120,48"), { left: 120, top: 48 });
  assert.deepEqual(parsePin("0,0"), { left: 0, top: 0 });
});

test("parsePin эвдэрсэн утгыг үл тооно", () => {
  assert.equal(parsePin(null), null);
  assert.equal(parsePin(""), null);
  assert.equal(parsePin("12"), null);
  assert.equal(parsePin("a,b"), null);
});
