import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sameRoot, nounChain, unionChain } from "../src/morphology.ts";

const here = dirname(fileURLToPath(import.meta.url));
const lines = (f: string): string[] =>
  readFileSync(join(here, "fixtures", f), "utf8")
    .trim()
    .split("\n")
    .map((w) => w.toLowerCase());

test("язгуур нэр үгийн хувилал (Македон)", () => {
  const fails = lines("makedon.txt").filter(
    (w) => w !== "македон" && !sameRoot("македон", w),
  );
  assert.deepEqual(fails, []);
});

test("язгуур үйл үгийн хувилал (цахир)", () => {
  const fails = lines("tsahir.txt").filter((w) => !sameRoot("цахир", w));
  assert.deepEqual(fails, []);
});

test("язгуур үг байхгүй бол хамгийн богино хувилбарыг тооцно", () => {
  const forms = lines("tsahir.txt").sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const w of forms) {
    if (!kept.some((k) => sameRoot(k, w))) kept.push(w);
  }
  assert.equal(kept.length, 1);
});

test("тийн ялгалын нөхцөлүүд залгагдана", () => {
  for (const [a, b] of [
    ["баффет", "баффетийн"],
    ["баффет", "баффетын"],
    ["баффет", "баффетынхаасаа"],
    ["баффет", "баффетынхнаасаа"],
    ["баффета", "баффетын"],
    ["цэнг", "цэнгээ"],
    ["гэр", "гэрт"],
    ["хот", "хотод"],
    ["тег", "тег-аас"],
  ]) {
    assert.equal(sameRoot(a, b), true, a + " ~ " + b);
  }
});

test("нөхцөл залгахдаа эгшиг гээх язгуурууд", () => {
  for (const [a, b] of [
    ["морь", "морины"],
    ["морь", "морио"],
    ["түвшинд", "түвшний"],
    ["түвшин", "түвшний"],
  ]) {
    assert.equal(sameRoot(a, b), true, a + " ~ " + b);
  }
});

test("өөр язгуурын үгс холбогдохгүй", () => {
  for (const [a, b] of [
    ["баффет", "баффетт"],
    ["сар", "сав"],
    ["ном", "нойр"],
    ["шилхинцэг", "шилгэнцэг"],
    ["нэр", "нэгж"],
  ]) {
    assert.equal(sameRoot(a, b), false, a + " ~ " + b);
  }
});

test("давхцал 3 үсгээс цөөн бол тооцохгүй", () => {
  assert.equal(sameRoot("аа", "ааб"), false);
  assert.equal(sameRoot("ба", "баын"), false);
});

test("нэр үгийн нөхцөл: 7 тийн ялгал + хамаатуулах", () => {
  for (const t of ["ын", "ийн", "аас", "аараа", "тайгаа", "ынхаа", "гүй"]) {
    assert.equal(nounChain(t, "н"), true, t);
  }
  assert.equal(nounChain("хинцэг", "л"), false);
});

test("3 үсэг дараалж дурын нөхцөл үүсгэхгүй", () => {
  assert.equal(unionChain("хинцэг", "л"), false);
  assert.equal(unionChain("нхдээ", "й"), true);
});

test("тт давхардал нөхцөлд үл тооцогдоно", () => {
  assert.equal(nounChain("т", "т"), false);
  assert.equal(nounChain("т", "р"), true);
});
