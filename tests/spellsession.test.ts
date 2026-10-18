import { resetStorage } from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { addIgnored, clearIgnored } from "../src/spell/ignore.ts";
import { createSpellSession, tokenizeAll } from "../src/spell/spellsession.ts";

beforeEach(() => {
  resetStorage();
  clearIgnored();
});

function session(wrong: readonly string[], markup = false) {
  const asked: string[][] = [];
  const progress: string[] = [];
  const spell = createSpellSession({
    checker: {
      checkWords: async (words) => {
        asked.push(words);
        return Object.fromEntries(words.map((w) => [w, !wrong.includes(w)]));
      },
    },
    markup: () => markup,
    isLatex: () => false,
    progress: async (message) => {
      progress.push(message);
    },
  });
  return { spell, asked, progress };
}

test("computeBad: шалгаагүй үгийг зөв гэж үзнэ", () => {
  const { spell } = session(["алдаа"]);
  const { bad, total } = spell.computeBad("сайн алдаа үг");
  assert.equal(total, 3);
  assert.deepEqual(bad, []);
});

test("computeBad: шалгасны дараа буруу үгийг байрлалтай нь буцаана", async () => {
  const { spell } = session(["алдаа"]);
  const text = "сайн алдаа үг";
  const tokens = tokenizeAll(text);
  await spell.ensureChecked(text, tokens);
  const { bad } = spell.computeBad(text, tokens);
  assert.deepEqual(
    bad.map(({ word, start, end }) => ({ word, start, end })),
    [{ word: "алдаа", start: 5, end: 10 }],
  );
});

test("computeBad: алгасах жагсаалтын үгийг тооцохгүй", async () => {
  const { spell } = session(["алдаа"]);
  addIgnored("алдаа");
  await spell.ensureChecked("алдаа");
  assert.deepEqual(spell.computeBad("алдаа").bad, []);
});

test("ensureChecked: нэг үгийг дахин асуухгүй, clear дараа дахин асууна", async () => {
  const { spell, asked } = session([]);
  await spell.ensureChecked("үг үг");
  await spell.ensureChecked("үг");
  assert.deepEqual(asked, [["үг"]]);
  spell.clear();
  await spell.ensureChecked("үг");
  assert.equal(asked.length, 2);
});

test("correctNow: кэшээс эсвэл шалгагчаас хариулна", async () => {
  const { spell, asked } = session(["алдаа"]);
  assert.equal(await spell.correctNow("алдаа"), false);
  assert.equal(await spell.correctNow("алдаа"), false);
  assert.equal(asked.length, 1);
});

test("plainFences: markup горимд эсвэл латин биш үгэнд хоосон", () => {
  const text = "```\ncode\n```";
  assert.deepEqual(session([]).spell.plainFences(text, "үг"), []);
  assert.deepEqual(session([], true).spell.plainFences(text, "code"), []);
  assert.ok(session([]).spell.plainFences(text, "code").length > 0);
});
