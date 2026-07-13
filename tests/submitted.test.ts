import { resetStorage, rawGet, rawSet } from "./helpers/mock-storage.ts";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getSubmitted, addSubmitted } from "../src/submitted.ts";

const KEY = "mn-spell:submitted";

beforeEach(() => resetStorage());

test("getSubmitted: хоосон үед хоосон Set буцаана", () => {
  assert.equal(getSubmitted().size, 0);
});

test("addSubmitted: жижиг үсгээр хадгалж давхардлыг нэгтгэнэ", () => {
  addSubmitted(["Үг", "үг", "Хоёр"]);
  const s = getSubmitted();
  assert.deepEqual([...s].sort(), ["хоёр", "үг"].sort());
  assert.equal(rawGet(KEY), JSON.stringify([...s]));
});

test("addSubmitted: өмнөх хадгалалт дээр нэмнэ", () => {
  addSubmitted(["нэг"]);
  addSubmitted(["хоёр"]);
  assert.deepEqual([...getSubmitted()].sort(), ["нэг", "хоёр"].sort());
});

test("getSubmitted: эвдэрсэн JSON-д хоосон Set буцаана", () => {
  rawSet(KEY, "{эвдэрхий");
  assert.equal(getSubmitted().size, 0);
});

test("getSubmitted: жагсаалт биш утгад хоосон Set буцаана", () => {
  rawSet(KEY, JSON.stringify({ a: 1 }));
  assert.equal(getSubmitted().size, 0);
});
