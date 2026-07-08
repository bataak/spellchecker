import { resetStorage, rawGet } from "./helpers/mock-storage.js";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  isIgnored,
  addIgnored,
  removeIgnored,
  clearIgnored,
  getIgnored,
} from "../src/ignore.js";

const KEY = "mn-spell:ignored";

beforeEach(() => {
  resetStorage();
  clearIgnored();
});

test("addIgnored: шинэ үг нэмэгдэж хадгалагдана", () => {
  assert.equal(addIgnored("тест"), true);
  assert.deepEqual(getIgnored(), ["тест"]);
  assert.equal(rawGet(KEY), JSON.stringify(["тест"]));
});

test("addIgnored: давхардлыг тооцохгүй", () => {
  addIgnored("тест");
  assert.equal(addIgnored("тест"), false);
  assert.equal(getIgnored().length, 1);
});

test("addIgnored: хоосон утгыг зөвшөөрөхгүй", () => {
  assert.equal(addIgnored("  "), false);
  assert.equal(addIgnored(""), false);
});

test("isIgnored: жижиг үсгээр бичигдсэн үгэнд том жижиг бүх хувилбар үйлчилнэ", () => {
  addIgnored("тест");
  assert.equal(isIgnored("тест"), true);
  assert.equal(isIgnored("Тест"), true);
  assert.equal(isIgnored("ТЕСТ"), true);
});

test("isIgnored: том үсгээр эхэлсэн үгэнд зөвхөн том хувилбар хүчинтэй", () => {
  addIgnored("Тест");
  assert.equal(isIgnored("Тест"), true);
  assert.equal(isIgnored("ТЕСТ"), true);
  assert.equal(isIgnored("тест"), false);
});

test("isIgnored: том үсгээр бичигдсэн үгэнд бүх үсэг нь том хувилбар хүчинтэй", () => {
  addIgnored("ТЕСТ");
  assert.equal(isIgnored("ТЕСТ"), true);
  assert.equal(isIgnored("Тест"), false);
  assert.equal(isIgnored("тест"), false);
});

test("isIgnored: жагсаалтад байхгүй үг", () => {
  assert.equal(isIgnored("байхгүй"), false);
});

test("addIgnored: жижиг хувилбар том хувилбарыг орлоно", () => {
  addIgnored("Тест");
  assert.equal(addIgnored("тест"), true);
  assert.equal(getIgnored().length, 1);
  assert.equal(isIgnored("тест"), true);
});

test("removeIgnored: байгаа үгийг алгасна", () => {
  addIgnored("тест");
  assert.equal(removeIgnored("тест"), true);
  assert.deepEqual(getIgnored(), []);
  assert.equal(isIgnored("тест"), false);
});

test("removeIgnored: байхгүй үгэнд false", () => {
  assert.equal(removeIgnored("байхгүй"), false);
});

test("clearIgnored: бүгдийг устгана, хоосон үед false", () => {
  addIgnored("нэг");
  addIgnored("хоёр");
  assert.equal(clearIgnored(), true);
  assert.deepEqual(getIgnored(), []);
  assert.equal(clearIgnored(), false);
});

test("getIgnored: хуулбарыг буцаана", () => {
  addIgnored("тест");
  const list = getIgnored();
  list.push("гаднаас");
  assert.deepEqual(getIgnored(), ["тест"]);
});
