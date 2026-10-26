import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { revealCollab } from "../vite-collab.ts";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const collabTag = (page: string): string =>
  /<button\s+id="collabBtn"[^>]*>/.exec(page)![0];

test("vite-collab: хамтрах товчийг endpoint-той build-д эхнээс нь харуулна", () => {
  assert.match(collabTag(html), /hidden=""/);
  const shown = revealCollab(html, "https://collab.example");
  assert.doesNotMatch(collabTag(shown), /hidden/);
  const hiddenCount = (page: string): number => page.split('hidden=""').length;
  assert.equal(hiddenCount(shown), hiddenCount(html) - 1);
  assert.equal(revealCollab(html, ""), html);
});
