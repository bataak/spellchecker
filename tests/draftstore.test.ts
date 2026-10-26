import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";

import { rawGet, rawSet, resetStorage } from "./helpers/mock-storage.ts";
import { createDraftStore, LARGE_DRAFT } from "../src/slots/slotstore.ts";

beforeEach(() => resetStorage());

test("draftStore: жижиг бичвэрийг хадгалж, хоосныг устгана", async () => {
  const store = createDraftStore();
  store.save("plain", "сайн");
  assert.equal(await store.read("plain"), "сайн");
  store.save("plain", "  ");
  assert.equal(await store.read("plain"), null);
});

test("draftStore: хадгалж чадаагүйг мэдэгдэнэ", () => {
  let failed = 0;
  const store = createDraftStore(() => failed++);
  store.fail();
  assert.equal(failed, 1);
});

test("draftStore: том бичвэрийн тэмдгийг устгана", () => {
  const store = createDraftStore();
  rawSet("mdDraft:plain", "x");
  store.drop("plain");
  assert.equal(rawGet("mdDraft:plain"), null);
  assert.notEqual(LARGE_DRAFT, "x");
});
