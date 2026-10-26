import { strict as assert } from "node:assert";
import { test } from "node:test";

import { escapedAt, lineAt, lineEndAt, lineStartAt } from "../src/core/text.ts";

test("escapedAt: сондгой тооны \\ өмнө байвал escape гэж үзнэ", () => {
  assert.equal(escapedAt("\\$", 1), true);
  assert.equal(escapedAt("\\\\$", 2), false);
  assert.equal(escapedAt("$", 0), false);
  assert.equal(escapedAt("$", -2), false);
});

test("lineAt: байрлалын мөрийг хил хязгаартай нь буцаана", () => {
  const text = "нэг\nхоёр\nгурав";
  assert.equal(lineStartAt(text, 6), 4);
  assert.equal(lineEndAt(text, 6), 8);
  assert.equal(lineAt(text, 6), "хоёр");
  assert.equal(lineAt(text, text.length), "гурав");
  assert.equal(lineAt(text, text.length + 1), "");
});
