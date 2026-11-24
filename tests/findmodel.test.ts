import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAll,
  matchAfter,
  matchAt,
  matchBefore,
  matchesIn,
  MATCH_LIMIT,
  replaceAll,
  replaceEdits,
  shiftOffset,
} from "../src/editor/findmodel.ts";

const TEXT = "Өвөл болж, өвөл ирлээ. ӨВӨЛ (a+b) өвөл.";

test("findAll: том жижиг үсгийг ялгалгүй бүх олдцыг олно", () => {
  const found = findAll(TEXT, "өвөл");
  assert.deepEqual(
    found.map((m) => TEXT.slice(m.from, m.to)),
    ["Өвөл", "өвөл", "ӨВӨЛ", "өвөл"],
  );
  assert.deepEqual(findAll(TEXT, ""), []);
});

test("findAll: тусгай тэмдэгтийг энгийн бичвэр гэж хайна", () => {
  const found = findAll(TEXT, "(a+b)");
  assert.equal(found.length, 1);
  assert.equal(TEXT.slice(found[0]!.from, found[0]!.to), "(a+b)");
  assert.deepEqual(findAll("a.b", "."), [{ from: 1, to: 2 }]);
});

test("findAll: олдцын тоог хязгаарлана", () => {
  assert.equal(findAll("а".repeat(MATCH_LIMIT + 5), "а").length, MATCH_LIMIT);
});

test("matchAfter, matchBefore: курсороос эхлэн дараах, өмнөхийг тойруулж олно", () => {
  const found = findAll(TEXT, "өвөл");
  assert.equal(matchAfter(found, 0), 0);
  assert.equal(matchAfter(found, 1), 1);
  assert.equal(matchAfter(found, TEXT.length), 0);
  assert.equal(matchBefore(found, found[2]!.from), 1);
  assert.equal(matchBefore(found, 0), found.length - 1);
  assert.equal(matchAfter([], 0), -1);
  assert.equal(matchBefore([], 0), -1);
});

test("matchesIn: мужид хүрсэн олдцуудыг өгнө", () => {
  const found = findAll(TEXT, "өвөл");
  assert.deepEqual(matchesIn(found, 2, found[1]!.from), found.slice(0, 2));
  assert.deepEqual(matchesIn(found, TEXT.length, TEXT.length), []);
});

test("replaceAll: олдцын том жижиг үсгийг хадгалж солино", () => {
  assert.equal(
    replaceAll(TEXT, findAll(TEXT, "өвөл"), "өвөл", "зун"),
    "Зун болж, зун ирлээ. ЗУН (a+b) зун.",
  );
  assert.equal(replaceAll(TEXT, [], "өвөл", "x"), TEXT);
});

test("replaceAll: алдаа шалгагчийн адил дүрмээр солино", () => {
  const text = "баих Баих БАИХ";
  const found = findAll(text, "баих");
  assert.equal(replaceAll(text, found, "баих", "байх"), "байх Байх БАЙХ");
  assert.equal(replaceAll(text, found, "баих", "Байх"), "Байх Байх БАЙХ");
  assert.equal(replaceAll(text, found, "Баих", "Байх"), "байх Байх БАЙХ");
  assert.equal(
    replaceAll(text, found, "баих", "iPhone"),
    "iPhone iPhone iPhone",
  );
});

test("findAll: бүтэн үгээр хайхад үгийн хэсгийг алгасна", () => {
  const text = "өвөл өвлийн Өвөлжөө (өвөл) өвөл-зун 2өвөл ӨВӨЛ.";
  const found = findAll(text, "өвөл", true);
  assert.deepEqual(
    found.map((m) => text.slice(m.from, m.to)),
    ["өвөл", "өвөл", "өвөл", "ӨВӨЛ"],
  );
  assert.equal(findAll(text, "өвөл").length, 6);
  assert.equal(findAll("a.b a b", "a.b", true).length, 1);
});

test("shiftOffset: засварын дараа байрлалыг шилжүүлнэ", () => {
  const edits = [
    { from: 2, to: 6, size: 2 },
    { from: 10, to: 14, size: 6 },
  ];
  assert.equal(shiftOffset(0, edits), 0);
  assert.equal(shiftOffset(2, edits), 2);
  assert.equal(shiftOffset(4, edits), 2);
  assert.equal(shiftOffset(6, edits), 4);
  assert.equal(shiftOffset(8, edits), 6);
  assert.equal(shiftOffset(12, edits), 8);
  assert.equal(shiftOffset(20, edits), 20);
  assert.equal(shiftOffset(5, []), 5);
});

test("matchAt: курсор байгаа эсвэл түүний дараах олдцыг сонгоно", () => {
  const found = findAll(TEXT, "өвөл");
  assert.equal(matchAt(found, 0), 0);
  assert.equal(matchAt(found, 2), 0);
  assert.equal(matchAt(found, 4), 1);
  assert.equal(matchAt(found, found[3]!.to), 0);
  assert.equal(matchAt([], 3), -1);
});

test("findAll ба replaceEdits: яг горимд том жижиг үсгийг ялгаж, бичсэнээр нь солино", () => {
  const text = "баих Баих БАИХ баих";
  const found = findAll(text, "баих", false, true);
  assert.deepEqual(
    found.map((m) => m.from),
    [0, 15],
  );
  assert.equal(findAll(text, "Баих", false, true).length, 1);
  assert.equal(
    replaceEdits(text, findAll(text, "баих"), "баих", "байх", true).text,
    "байх байх байх байх",
  );
});

test("findAll: хязгааргүй үед 10 000-аас олон олдоцыг бүгдийг олно (#347)", () => {
  const text = "ном ".repeat(MATCH_LIMIT + 5);
  assert.equal(findAll(text, "ном").length, MATCH_LIMIT);
  const every = findAll(text, "ном", false, false, Infinity);
  assert.equal(every.length, MATCH_LIMIT + 5);
  assert.equal(replaceAll(text, every, "ном", "дэвтэр").includes("ном"), false);
});
