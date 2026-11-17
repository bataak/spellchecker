import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findAll,
  matchAfter,
  matchBefore,
  matchesIn,
  MATCH_LIMIT,
  replaceAll,
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

test("replaceAll: бүх олдцыг солино", () => {
  assert.equal(
    replaceAll(TEXT, findAll(TEXT, "өвөл"), "зун"),
    "зун болж, зун ирлээ. зун (a+b) зун.",
  );
  assert.equal(replaceAll(TEXT, [], "x"), TEXT);
});
