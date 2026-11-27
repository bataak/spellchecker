import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceShown } from "../src/editor/findtool.ts";

test("replaceShown хадгалсан сонголтыг дагана, эс бөгөөс мэдрэгч дэлгэцэнд нууна", () => {
  assert.equal(replaceShown(null, false), true);
  assert.equal(replaceShown(null, true), false);
  assert.equal(replaceShown("1", true), true);
  assert.equal(replaceShown("0", false), false);
});
