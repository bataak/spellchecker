import { resetStorage, rawGet, rawSet } from "./helpers/mock-storage.ts";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  isIgnored,
  addIgnored,
  removeIgnored,
  clearIgnored,
  getIgnored,
} from "../src/ignore.ts";

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

test("addIgnored: өөр табад хадгалсан үгийг дарж бичихгүй", () => {
  addIgnored("Хүрэлбаатар");
  rawSet(KEY, JSON.stringify(["Хүрэлбаатар", "Болд"]));
  addIgnored("Цэцэгмаа");
  assert.deepEqual(JSON.parse(rawGet(KEY)!), [
    "Хүрэлбаатар",
    "Болд",
    "Цэцэгмаа",
  ]);
  assert.equal(isIgnored("Болд"), true);
});

test("isIgnored: задарсан ба нийлмэл й, ё ялгаагүй таарна", () => {
  addIgnored("Хүрэлбаатарай".normalize("NFD"));
  assert.equal(isIgnored("Хүрэлбаатарай"), true);
  assert.deepEqual(getIgnored(), ["Хүрэлбаатарай"]);
  clearIgnored();
  addIgnored("Ёслол");
  assert.equal(isIgnored("Ёслол".normalize("NFD")), true);
  assert.equal(addIgnored("Ёслол".normalize("NFD")), false);
});

test("addIgnored: том үсгээр эхэлсэн үгийн дараа бүхэлдээ том хувилбар нэмэхэд хамрах хүрээ багасахгүй", () => {
  addIgnored("Ном");
  assert.equal(addIgnored("НОМ"), false);
  assert.deepEqual(getIgnored(), ["Ном"]);
  assert.equal(isIgnored("Ном"), true);
  assert.equal(isIgnored("НОМ"), true);
  assert.equal(addIgnored("ном"), true);
  assert.deepEqual(getIgnored(), ["ном"]);
});

test("addIgnored: латин үндэс ба кирилл нөхцөлтэй үгийн үндсийг алгасна", () => {
  assert.equal(addIgnored("iPhone-ийн"), true);
  assert.deepEqual(getIgnored(), ["iPhone"]);
  for (const word of ["iPhone-ийн", "iPhone-ийг", "iPhone-оор", "iPhone"])
    assert.equal(isIgnored(word), true, word);
  assert.equal(isIgnored("Android-ийн"), false);
});

test("addIgnored: латин кирилл холилдсон үгийг нэмэхгүй", () => {
  assert.equal(addIgnored("iPhoneийн"), false);
  assert.equal(addIgnored("iPhone-ИЙН"), false);
  assert.deepEqual(getIgnored(), []);
});

test("хуучин бүтэн бүртгэлийг уншихдаа үндэс болгож, холимог үгийг хасна", () => {
  rawSet(KEY, JSON.stringify(["iPhone-ийн", "iPhoneийн", "ном"]));
  addIgnored("тест");
  assert.deepEqual(getIgnored(), ["iPhone", "ном", "тест"]);
  assert.equal(isIgnored("iPhone-ээс"), true);
});

test("addIgnored: цэгтэй үгийг хэсэглэж, цэгийн өмнөх 1-2 үсгийг нэмэхгүй", () => {
  assert.equal(addIgnored("Ш.Нацагдорж"), true);
  assert.deepEqual(getIgnored(), ["Нацагдорж"]);
  assert.equal(isIgnored("Ш.Нацагдорж"), true);
  assert.equal(addIgnored("Бат.Дорж"), true);
  assert.deepEqual(getIgnored(), ["Нацагдорж", "Бат", "Дорж"]);
  assert.equal(isIgnored("Бат.Дорж"), true);
  assert.equal(isIgnored("Бат.Болд"), false);
  assert.equal(addIgnored("Ж.Ш.Бат"), false);
  assert.equal(addIgnored("т.г"), false);
  assert.deepEqual(getIgnored(), ["Нацагдорж", "Бат", "Дорж"]);
});
