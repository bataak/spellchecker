import { test } from "node:test";
import assert from "node:assert/strict";
import type { SpellerInstance } from "../src/spell/backend.ts";
import { createWordCheck } from "../src/spell/wordcheck.ts";

const speller = (
  known: string[],
  suggestions: Record<string, string[]> = {},
  stems: Record<string, string[]> = {},
): SpellerInstance & { calls: number } => {
  const inst = {
    calls: 0,
    spell: (word: string) => known.includes(word),
    suggest: (word: string) => {
      inst.calls++;
      return suggestions[word] ?? [];
    },
    stem: (word: string) => stems[word] ?? [],
  };
  return inst;
};

const setup = (ids: string[] = ["mn_MN", "en_US"]) => {
  const mn = speller(["байна", "ном"], { байнаа: ["байна", "байна уу"] });
  const en = speller(["book", "run"], { bok: ["book"] }, { books: ["book"] });
  const all = [
    { id: "mn_MN", inst: mn },
    { id: "en_US", inst: en },
  ];
  const words = createWordCheck({
    primary: () => mn,
    active: () => all.filter(({ id }) => ids.includes(id)),
  });
  return { mn, en, words };
};

test("wordcheck үгийг бичгийнх нь толиор шалгана", () => {
  const { words } = setup();
  assert.equal(words.isCorrect("байна"), true);
  assert.equal(words.isCorrect("байнаа"), false);
  assert.equal(words.isCorrect("book"), true);
  assert.equal(words.isCorrect("bok"), false);
});

test("wordcheck идэвхгүй хэлний үгийг зөв гэж үзнэ", () => {
  const { words } = setup(["mn_MN"]);
  assert.equal(words.isCorrect("bok"), true);
  assert.equal(words.isCorrect("байнаа"), false);
});

test("wordcheck саналыг бичгээр нь шүүж, санах ойд хадгална", () => {
  const { mn, en, words } = setup();
  assert.deepEqual(words.suggest("байнаа"), ["байна", "байна уу"]);
  assert.deepEqual(words.suggest("байнаа"), ["байна", "байна уу"]);
  assert.equal(mn.calls, 1);
  assert.equal(en.calls, 0);
  assert.deepEqual(words.suggest("bok"), ["book"]);
});

test("wordcheck том үсгээр эхэлсэн үгийг жинхэнэ нэр гэж үзнэ", () => {
  const { words } = setup();
  assert.equal(words.lookupModeOf("Ном"), "any");
  assert.equal(words.lookupModeOf("Бат"), "proper");
  assert.equal(words.lookupModeOf("бат"), "any");
});

test("wordcheck англи үгийн үндсийг англи толиноос авна", () => {
  const { words } = setup();
  assert.deepEqual(words.stemsOf("books"), ["book"]);
  assert.deepEqual(words.analysesFor("books"), []);
});
