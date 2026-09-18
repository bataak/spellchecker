import test from "node:test";
import assert from "node:assert/strict";

import {
  applyOrder,
  booknameOf,
  collectDicts,
  parseOrder,
  encodeBase,
  parseDictList,
  safeBase,
} from "../src/dictindex.ts";

const ifo = (name: string): string =>
  "StarDict's dict ifo file\nversion=3.0.0\nbookname=" + name + "\n";

test("collectDicts — бүрэн иж бүрдэлтэй толийг бүртгэнэ", () => {
  const names = [
    "mn.ifo",
    "mn.idx",
    "mn.dict.dz",
    "tuvshin.ifo",
    "tuvshin.idx.gz",
    "tuvshin.dict",
  ];
  assert.deepEqual(
    collectDicts(names, (base) => ifo(base === "mn" ? "Монгол толь" : "Төвшин")),
    [
      { base: "mn", label: "Монгол толь", version: "" },
      { base: "tuvshin", label: "Төвшин", version: "" },
    ],
  );
});

test("collectDicts — дэд хавтаснаас олно", () => {
  const names = [
    "mn.ifo",
    "mn.idx",
    "mn.dict.dz",
    "Mongolian Thesaurus-2.4.2/toli.ifo",
    "Mongolian Thesaurus-2.4.2/toli.idx",
    "Mongolian Thesaurus-2.4.2/toli.dict.dz",
    "Mongolian Thesaurus-2.4.2/toli.syn",
  ];
  assert.deepEqual(
    collectDicts(names, () => null).map((entry) => entry.base),
    ["Mongolian Thesaurus-2.4.2/toli", "mn"],
  );
});

test("safeBase — замын халдлагыг таслана", () => {
  assert.equal(safeBase("mn"), true);
  assert.equal(safeBase("хавтас/toli"), true);
  assert.equal(safeBase("../etc/passwd"), false);
  assert.equal(safeBase("/mn"), false);
  assert.equal(safeBase("a//b"), false);
  assert.equal(safeBase("a\\b"), false);
});

test("encodeBase — сегмент бүрийг тусад нь кодлоно", () => {
  assert.equal(encodeBase("Mongolian Thesaurus/toli"), "Mongolian%20Thesaurus/toli");
  assert.equal(encodeBase("mn"), "mn");
});

test("collectDicts — дутуу файлтай толийг алгасна", () => {
  assert.deepEqual(collectDicts(["a.ifo", "a.idx"], () => null), []);
  assert.deepEqual(collectDicts(["b.ifo", "b.dict.dz"], () => null), []);
  assert.deepEqual(collectDicts(["c.idx", "c.dict"], () => null), []);
});

test("collectDicts — bookname байхгүй бол нэрийг нь хэрэглэнэ", () => {
  assert.deepEqual(
    collectDicts(["x.ifo", "x.idx", "x.dict"], () => "StarDict's dict ifo file\n"),
    [{ base: "x", label: "x", version: "" }],
  );
  assert.deepEqual(
    collectDicts(["y.ifo", "y.idx", "y.dict"], () => null),
    [{ base: "y", label: "y", version: "" }],
  );
});

test("collectDicts — нэрээр эрэмбэлнэ", () => {
  const names = ["b.ifo", "b.idx", "b.dict", "a.ifo", "a.idx", "a.dict"];
  assert.deepEqual(
    collectDicts(names, () => null).map((entry) => entry.base),
    ["a", "b"],
  );
});

test("collectDicts — хувилбарын тэмдэг", () => {
  assert.deepEqual(
    collectDicts(
      ["a.ifo", "a.idx", "a.dict"],
      () => null,
      (base) => "v-" + base,
    ),
    [{ base: "a", label: "a", version: "v-a" }],
  );
});

const entry = (base: string): { base: string; label: string; version: string } => ({
  base,
  label: base,
  version: "",
});

test("parseOrder — тайлбар ба хоосон мөрийг хасна", () => {
  assert.deepEqual(
    parseOrder("# эрэмбэ\n\n toli \nmn # үндсэн\n"),
    ["toli", "mn"],
  );
});

test("applyOrder — жагсаалтын дарааллаар эрэмбэлнэ", () => {
  const dicts = [entry("a"), entry("mn"), entry("toli")];
  assert.deepEqual(
    applyOrder(dicts, ["toli", "mn"]).map((item) => item.base),
    ["toli", "mn", "a"],
  );
});

test("applyOrder — хавтсын нэрээр бүлгээр заана", () => {
  const dicts = [entry("mn"), entry("Thesaurus-2.4.2/toli")];
  assert.deepEqual(
    applyOrder(dicts, ["Thesaurus-2.4.2/"]).map((item) => item.base),
    ["Thesaurus-2.4.2/toli", "mn"],
  );
});

test("applyOrder — жагсаалтгүй бол дараалал хэвээр", () => {
  const dicts = [entry("a"), entry("b")];
  assert.deepEqual(
    applyOrder(dicts, []).map((item) => item.base),
    ["a", "b"],
  );
});

test("booknameOf", () => {
  assert.equal(booknameOf(ifo("Толь")), "Толь");
  assert.equal(booknameOf("\uFEFF" + ifo("Толь")), "Толь");
  assert.equal(booknameOf("bookname=\n"), null);
  assert.equal(booknameOf("wordcount=3\n"), null);
});

test("parseDictList — зөв бүтцийг уншина", () => {
  assert.deepEqual(
    parseDictList({
      dicts: [{ base: "mn", label: "Монгол", version: "a1" }, { base: "x" }],
    }),
    [
      { base: "mn", label: "Монгол", version: "a1" },
      { base: "x", label: "x", version: "" },
    ],
  );
});

test("parseDictList — хог утгыг шүүнэ", () => {
  assert.deepEqual(parseDictList(null), []);
  assert.deepEqual(parseDictList({ dicts: "mn" }), []);
  assert.deepEqual(parseDictList({ dicts: [1, null, {}, { base: "" }] }), []);
  assert.deepEqual(
    parseDictList({ dicts: [{ base: "../secret" }, { base: "/a" }] }),
    [],
  );
});
