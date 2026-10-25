import { test } from "node:test";
import assert from "node:assert/strict";
import { createImageStore } from "../src/files/images.ts";

test("зургийн store-ууд бие биеэсээ тусдаа төлөвтэй", () => {
  const first = createImageStore();
  const second = createImageStore();
  const saved: string[] = [];
  let heard = 0;
  first.persistTo((src) => saved.push(src));
  const off = first.onChange(() => heard++);
  const blob = new Blob(["png"], { type: "image/png" });
  first.put("a.png", blob);
  assert.equal(first.blob("a.png"), blob);
  assert.match(first.url("a.png") ?? "", /^blob:/);
  assert.equal(second.blob("a.png"), null);
  assert.deepEqual(saved, ["a.png"]);
  assert.equal(first.freePath("a.png", blob), "a.png");
  assert.equal(
    first.freePath("a.png", new Blob(["other"], { type: "image/png" })),
    "a-2.png",
  );
  second.restore([["b.png", blob]]);
  second.restore([["b.png", blob]]);
  assert.equal(second.blob("b.png"), blob);
  assert.equal(first.isBlockedRemote("https://x/y.png"), true);
  assert.equal(first.url("https://x/y.png"), null);
  first.allowRemote(["https://x/y.png"]);
  assert.equal(first.url("https://x/y.png"), "https://x/y.png");
  first.clear();
  first.clear();
  off();
  assert.equal(first.blob("a.png"), null);
  assert.equal(heard, 3);
});
