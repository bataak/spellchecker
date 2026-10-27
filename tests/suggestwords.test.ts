import test from "node:test";
import assert from "node:assert/strict";

import {
  closeSuggestion,
  editDistance,
  findTypos,
  typoNote,
  copyList,
  mergeWords,
  prefillWords,
  screenWords,
  splitParts,
} from "../src/feedback/suggestwords.ts";

const entry = (word: string) => ({ word, start: 0, count: 1 });

test("prefillWords: кирилл бус, илгээсэн, ижил язгууртай үгийг хасна", () => {
  const words = prefillWords(
    [
      entry("македоны"),
      entry("македон"),
      entry("hello"),
      entry("цахир"),
      entry("бууз"),
      entry("а"),
    ],
    new Set(["бууз"]),
  );
  assert.deepEqual(words, ["македон", "цахир"]);
});

test("prefillWords: монгол цагаан толгойн дарааллаар эрэмбэлнэ", () => {
  assert.deepEqual(
    prefillWords(
      [entry("өвөл"), entry("ойр"), entry("ус"), entry("үүл")],
      new Set(),
    ),
    ["ойр", "өвөл", "ус", "үүл"],
  );
});

test("screenWords: буруу ба илгээсэн үгийг тайлбартай хасна", () => {
  const out = screenWords(
    ["Морь", "x", "морь", "нохой", "Нохой"],
    new Set(["нохой"]),
  );
  assert.deepEqual(out.valid, ["Морь"]);
  assert.deepEqual(
    out.notes.map((note) => note.word),
    ["x", "нохой", "Нохой"],
  );
});

test("mergeWords: толь бичигт байгаа үгийг алгасаж, давхардлыг нэмэхгүй", () => {
  const out = mergeWords(
    ["тэмээ"],
    ["Тэмээ", "ямаа", "үхэр"],
    { ямаа: true },
    10,
  );
  assert.deepEqual(out.words, ["тэмээ", "үхэр"]);
  assert.equal(out.added, true);
  assert.deepEqual(out.notes, [
    { word: "ямаа", text: "энэ үг толь бичигт байна" },
  ]);
});

test("mergeWords: дээд хязгаарт хүрвэл зогсож мэдэгдэнэ", () => {
  const out = mergeWords(["а1"], ["бб", "вв"], null, 2);
  assert.deepEqual(out.words, ["а1", "бб"]);
  assert.deepEqual(out.notes, [{ word: null, text: "Хамгийн ихдээ 2 үг" }]);
  assert.equal(mergeWords(["бб"], ["Бб"], null, 5).added, false);
});

test("splitParts ба copyList: таслал, зай, хятад таслалаар хуваана", () => {
  assert.deepEqual(splitParts("а, б、в，г  д"), ["а", "б", "в", "г", "д"]);
  assert.deepEqual(copyList(["Морь"], " морь, үхэр ,, тэмээ"), [
    "Морь",
    "үхэр",
    "тэмээ",
  ]);
});

test("editDistance: оруулах, хасах, солих, байр солих", () => {
  assert.equal(editDistance("боловсролы", "боловсролын"), 1);
  assert.equal(editDistance("идэвхитэй", "идэвхтэй"), 1);
  assert.equal(editDistance("даргийн", "даргын"), 2);
  assert.equal(editDistance("үгс", "үсг"), 1);
  assert.equal(editDistance("", "ам"), 2);
});

test("closeSuggestion: богино үгэнд 1, урт үгэнд 2 хүртэлх зөрүүг тооцно", () => {
  assert.equal(closeSuggestion("ДАРГИЙН", ["даргын"]), "даргын");
  assert.equal(closeSuggestion("гэрт", ["гэр", "гэрээ"]), "гэр");
  assert.equal(closeSuggestion("сү", ["сүү", "суу"]), "сүү");
  assert.equal(closeSuggestion("гэрт", ["гэрээс"]), null);
  assert.equal(closeSuggestion("тэндэг", ["тэн дэг"]), null);
  assert.equal(closeSuggestion("Улаанбаатар", ["улаанбаатар"]), null);
});

test("findTypos ба typoNote: ойр санал байгаа үгийг жагсааж, алдаатай саналыг алгасна", async () => {
  const typos = await findTypos(
    ["боловсролы", "шинэүг", "эвдэрсэн"],
    async (word) => {
      if (word === "эвдэрсэн") throw new Error("worker");
      return word === "боловсролы" ? ["боловсролын"] : ["огт өөр"];
    },
  );
  assert.deepEqual(typos, [{ word: "боловсролы", fix: "боловсролын" }]);
  assert.match(
    typoNote(typos),
    /^Алдаатай бичсэн байж магадгүй: «боловсролы» → «боловсролын»\./,
  );
  const many = Array.from({ length: 7 }, (_, i) => ({
    word: "а" + i,
    fix: "б" + i,
  }));
  assert.match(typoNote(many), /«а4» → «б4», …\./);
});
