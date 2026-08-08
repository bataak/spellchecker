import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWordsBatched, tokenize } from "../src/spellchecker.ts";

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
  const checker = fakeChecker({
    а: true,
    б: true,
    в: true,
    г: true,
    д: true,
  });
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

test("tokenize: тоо залгасан үгийг үсгэн хэсгээр нь салгана", () => {
  assert.deepEqual(
    [...tokenize("Конвенци-1982 онд")],
    [
      { word: "Конвенци", index: 0 },
      { word: "1982", index: 9 },
      { word: "онд", index: 14 },
    ],
  );
});

test("tokenize: цифрийн ард ирэх нөхцөлийг салгаж шалгана", () => {
  assert.deepEqual(
    [...tokenize("1982-онд")],
    [
      { word: "1982", index: 0 },
      { word: "онд", index: 5 },
    ],
  );
});

test("tokenize: гурван хэсэгтэй бүтцийг зураас бүр дээр нь таслана", () => {
  assert.deepEqual(
    [...tokenize("Конвенци-1982-ны")],
    [
      { word: "Конвенци", index: 0 },
      { word: "1982", index: 9 },
      { word: "ны", index: 14 },
    ],
  );
});

test("tokenize: үсгэн дагавартай зураас хэвээр үлдэнэ", () => {
  assert.deepEqual([...tokenize("e-mail")], [{ word: "e-mail", index: 0 }]);
});

test("tokenize: хаалттай товчлолын дагавар хэвээр салангид үлдэнэ", () => {
  assert.deepEqual(
    [...tokenize("(АЖМХ)-ны")],
    [
      { word: "АЖМХ", index: 1 },
      { word: "ны", index: 7 },
    ],
  );
});

test("tokenize: аравтын бутархайг нөхцлөөс нь салгана", () => {
  assert.deepEqual(
    [...tokenize("3.5-ын")],
    [
      { word: "3.5", index: 0 },
      { word: "ын", index: 4 },
    ],
  );
});

test("tokenize: техникийн нэрийн үсгэн хэсэг тусдаа гарна", () => {
  assert.deepEqual(
    [...tokenize("Т-72")],
    [
      { word: "Т", index: 0 },
      { word: "72", index: 2 },
    ],
  );
});

test("tokenize: салгасан токенуудын байрлал эх бичвэртэй таарна", () => {
  const text = "Ан-24 нисэв, COVID-19-ийн дараа Конвенци-1982 гарав";
  for (const { word, index } of tokenize(text)) {
    assert.equal(text.slice(index, index + word.length), word);
  }
});
