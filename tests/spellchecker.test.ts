import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWordsBatched } from "../src/spellchecker.ts";

function fakeChecker(dict: Record<string, boolean>) {
  const batches: string[][] = [];
  return {
    batches,
    checkWords: (words: string[]) => {
      batches.push(words);
      const out: Record<string, boolean> = {};
      for (const word of words) out[word] = dict[word] ?? false;
      return Promise.resolve(out);
    },
  };
}

test("checkWordsBatched: үгсийг batch хэмжээгээр хуваана", async () => {
  const checker = fakeChecker({ а: true, б: true, в: true, г: true, д: true });
  await checkWordsBatched(checker, ["а", "б", "в", "г", "д"], 2);
  assert.deepEqual(checker.batches, [["а", "б"], ["в", "г"], ["д"]]);
});

test("checkWordsBatched: бүх үр дүнг нэгтгэнэ", async () => {
  const checker = fakeChecker({ зөв: true, буруу: false });
  const results = await checkWordsBatched(checker, ["зөв", "буруу"], 1);
  assert.equal(results.get("зөв"), true);
  assert.equal(results.get("буруу"), false);
  assert.equal(results.size, 2);
});

test("checkWordsBatched: onBatch явцын мэдээллийг batch бүрд дуудна", async () => {
  const checker = fakeChecker({});
  const calls: Array<[number, number]> = [];
  await checkWordsBatched(checker, ["а", "б", "в"], 2, (done, total) => {
    calls.push([done, total]);
  });
  assert.deepEqual(calls, [
    [0, 3],
    [2, 3],
  ]);
});

test("checkWordsBatched: хоосон жагсаалтад checkWords дуудагдахгүй", async () => {
  const checker = fakeChecker({});
  const results = await checkWordsBatched(checker, [], 10);
  assert.equal(results.size, 0);
  assert.equal(checker.batches.length, 0);
});
