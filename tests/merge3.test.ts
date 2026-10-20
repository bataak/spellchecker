import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  conflictsOf,
  merge3,
  resolveChunks,
} from "../src/project/git/merge3.ts";

const BASE = "нэг\nхоёр\nгурав\nдөрөв\nтав";

test("merge3: өөр өөр мөрийн өөрчлөлтийг зөрчилгүй нэгтгэнэ", () => {
  const chunks = merge3(
    BASE,
    "нэг!\nхоёр\nгурав\nдөрөв\nтав",
    "нэг\nхоёр\nгурав\nдөрөв\nтав!\nзургаа",
  );
  assert.deepEqual(conflictsOf(chunks), []);
  assert.equal(
    resolveChunks(chunks, []),
    "нэг!\nхоёр\nгурав\nдөрөв\nтав!\nзургаа",
  );
});

test("merge3: ижил мөрийг хоёр талаас өөрчилбөл зөрчил гаргаж, сонголтоор шийднэ", () => {
  const ours = "нэг\nхоёр миний\nгурав\nдөрөв\nтав";
  const theirs = "нэг\nхоёр тэдний\nгурав\nдөрөв\nтав";
  const chunks = merge3(BASE, ours, theirs);
  assert.deepEqual(conflictsOf(chunks), [
    { ours: ["хоёр миний"], base: ["хоёр"], theirs: ["хоёр тэдний"] },
  ]);
  assert.equal(resolveChunks(chunks, ["ours"]), ours);
  assert.equal(resolveChunks(chunks, ["theirs"]), theirs);
  assert.equal(
    resolveChunks(chunks, ["both"]),
    "нэг\nхоёр миний\nхоёр тэдний\nгурав\nдөрөв\nтав",
  );
});

test("merge3: хоёр тал ижил өөрчлөлт хийвэл зөрчилгүй, нэг удаа авна", () => {
  const both = "нэг\nхоёр\nшинэ\nгурав\nдөрөв\nтав";
  const chunks = merge3(BASE, both, both);
  assert.deepEqual(conflictsOf(chunks), []);
  assert.equal(resolveChunks(chunks, []), both);
});

test("merge3: нэг тал устгаж, нөгөө тал нэмсэн мөрүүдийг нэгтгэнэ", () => {
  const chunks = merge3(
    BASE,
    "нэг\nгурав\nдөрөв\nтав",
    "өмнө\nнэг\nхоёр\nгурав\nдөрөв\nтав",
  );
  assert.deepEqual(conflictsOf(chunks), []);
  assert.equal(resolveChunks(chunks, []), "өмнө\nнэг\nгурав\nдөрөв\nтав");
});

test("merge3: хоосон суурьтай файлд хоёр өөр агуулга нэмбэл зөрчил", () => {
  const chunks = merge3("", "а", "б");
  assert.equal(conflictsOf(chunks).length, 1);
  assert.equal(resolveChunks(chunks, ["both"]), "а\nб");
});

test("merge3: санамсаргүй засварт нэг тал өөрчлөгдөөгүй бол нөгөөг нь бүтнээр авна", () => {
  let seed = 7;
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const edit = (lines: string[]): string[] => {
    const out = [...lines];
    for (let step = rand(4); step >= 0; step--) {
      const at = rand(out.length + 1);
      const kind = rand(3);
      if (kind === 0) out.splice(at, 0, "шинэ" + rand(9));
      else if (kind === 1 && out.length) out.splice(at % out.length, 1);
      else if (out.length) out[at % out.length] = "засвар" + rand(9);
    }
    return out;
  };
  for (let round = 0; round < 300; round++) {
    const base = Array.from({ length: rand(12) }, () => "мөр" + rand(5));
    const changed = edit(base).join("\n");
    const original = base.join("\n");
    assert.equal(
      resolveChunks(merge3(original, original, changed), []),
      changed,
    );
    assert.equal(
      resolveChunks(merge3(original, changed, original), []),
      changed,
    );
    const other = edit(base).join("\n");
    const chunks = merge3(original, changed, other);
    const picks = conflictsOf(chunks).map(() => "ours" as const);
    assert.equal(typeof resolveChunks(chunks, picks), "string");
  }
});
