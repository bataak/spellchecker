import { test } from "node:test";
import assert from "node:assert/strict";
import { dictPartOf, groupDictFiles } from "../src/userdicts.ts";

test("StarDict файлын төрлийг өргөтгөлөөр таньна", () => {
  assert.deepEqual(dictPartOf("Toli.ifo"), { base: "Toli", part: "ifo" });
  assert.deepEqual(dictPartOf("Toli.idx.gz"), { base: "Toli", part: "idx" });
  assert.deepEqual(dictPartOf("Toli.IDX"), { base: "Toli", part: "idx" });
  assert.deepEqual(dictPartOf("Toli.dict.dz"), { base: "Toli", part: "dict" });
  assert.deepEqual(dictPartOf("Toli.dict"), { base: "Toli", part: "dict" });
  assert.deepEqual(dictPartOf("Toli.syn"), { base: "Toli", part: "syn" });
  assert.equal(dictPartOf("readme.txt"), null);
});

test("файлуудыг нэрээр нь бүлэглэнэ", () => {
  const files = [
    { name: "A.ifo" },
    { name: "A.idx.gz" },
    { name: "A.dict.dz" },
    { name: "B.ifo" },
    { name: "B.idx" },
    { name: "notes.txt" },
  ];
  const groups = groupDictFiles(files);
  assert.deepEqual([...groups.keys()], ["A", "B"]);
  assert.equal(groups.get("A")?.dict?.name, "A.dict.dz");
  assert.equal(groups.get("B")?.dict, undefined);
});

test("толиудыг хадгалсан эрэмбээр байрлуулна", async () => {
  const { sortByOrder } = await import("../src/userdicts.ts");
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(
    sortByOrder(items, ["c", "a"]).map((item) => item.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    sortByOrder(items, ["x", "d"]).map((item) => item.id),
    ["d", "a", "b", "c"],
  );
  assert.deepEqual(
    sortByOrder(items, []).map((item) => item.id),
    ["a", "b", "c", "d"],
  );
});

test("толийг дээш доош зөөнө", async () => {
  const { moveItem } = await import("../src/userdicts.ts");
  assert.deepEqual(moveItem(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
});

test("хэрэглэгчийн толины түлхүүрийг id-гаас гаргана", async () => {
  const { userKeyOf } = await import("../src/userdicts.ts");
  assert.equal(userKeyOf("user:Их тайлбар толь"), "Их тайлбар толь");
  assert.equal(userKeyOf("bundled:Товч тайлбар толь"), null);
});

test("idx-ийн SHA-256-г тооцно", async () => {
  const { idxDigest } = await import("../src/userdicts.ts");
  assert.equal(
    await idxDigest(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("давхардсан толийг idx-ийн hash-ээр таньна", async () => {
  const { classifyImport } = await import("../src/userdicts.ts");
  const incoming = { name: "Товч тайлбар толь", digest: "aaa" };
  const bundled = { name: "Товч тайлбар толь", digest: "aaa", user: false };
  const user = { name: "Өөр нэр", digest: "aaa", user: true };
  assert.equal(classifyImport(incoming, [bundled], null), "bundled");
  assert.equal(classifyImport(incoming, [user], null), "same");
  assert.equal(
    classifyImport(incoming, [{ ...bundled, digest: "bbb" }], null),
    "add",
  );
  assert.equal(
    classifyImport(incoming, [], { name: incoming.name, digest: "aaa" }),
    "same",
  );
  assert.equal(
    classifyImport(incoming, [], { name: incoming.name, digest: "bbb" }),
    "update",
  );
});

test("дутуу файлуудыг тодорхойлно", async () => {
  const { missingParts, PART_LABELS } = await import("../src/userdicts.ts");
  assert.deepEqual(missingParts({ ifo: 1 }), ["idx", "dict"]);
  assert.deepEqual(missingParts({ ifo: 1, idx: 1, dict: 1 }), []);
  assert.deepEqual(missingParts({ syn: 1 }), ["ifo", "idx", "dict"]);
  assert.equal("Toli" + PART_LABELS.dict, "Toli.dict.dz");
});
