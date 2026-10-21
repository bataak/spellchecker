import {
  resetSession,
  resetStorage,
  rawGet,
  rawSet,
} from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  KEYS,
  at,
  read,
  readJson,
  readShared,
  remove,
  write,
  writeJson,
} from "../src/core/store.ts";

beforeEach(() => {
  resetStorage();
  resetSession();
});

test("shared түлхүүр бүх табт нийтлэг", () => {
  assert.equal(write(KEYS.theme, "dark"), true);
  assert.equal(rawGet("theme"), "dark");
  resetSession();
  assert.equal(read(KEYS.theme), "dark");
  remove(KEYS.theme);
  assert.equal(read(KEYS.theme), null);
});

test("tab түлхүүр табдаа давуу, шинэ таб сүүлийн утгаас эхэлнэ", () => {
  write(KEYS.template, "plain2");
  assert.equal(read(KEYS.template), "plain2");
  rawSet("mdTemplate", "letter");
  assert.equal(read(KEYS.template), "plain2");
  assert.equal(readShared(KEYS.template), "letter");
  resetSession();
  assert.equal(read(KEYS.template), "letter");
});

test("session түлхүүр зөвхөн тухайн табт", () => {
  write(KEYS.wipe, "1");
  assert.equal(rawGet("mn-spell:wipe"), null);
  assert.equal(read(KEYS.wipe), "1");
  resetSession();
  assert.equal(read(KEYS.wipe), null);
});

test("угтвар түлхүүр ба JSON", () => {
  const key = at(KEYS.draft, "plain");
  assert.equal(key.name, "mdDraft:plain");
  writeJson(KEYS.slots, [{ id: "file-a" }]);
  assert.deepEqual(readJson(KEYS.slots), [{ id: "file-a" }]);
  rawSet("mdFiles", "{эвдэрсэн");
  assert.equal(readJson(KEYS.slots), null);
});

test("түлхүүрийн нэр давхардахгүй", () => {
  const names = Object.values(KEYS).map((key) => key.name);
  assert.equal(new Set(names).size, names.length);
});
