import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodSplitDots,
  periodSplits,
  replaceAllWord,
  splitEveryOccurrence,
} from "../src/spell/wordfix.ts";
import { skipRanges } from "../src/spell/codeskip.ts";

test("алгассан код блок дахь үгийг солихгүй", () => {
  const text = "helo\n\n```js\nconst helo = 1;\n```";
  const out = replaceAllWord(
    text,
    "helo",
    "hello",
    4,
    "lower",
    null,
    skipRanges(text, { code: true }),
  );
  assert.equal(out.text, "hello\n\n```js\nconst helo = 1;\n```");
});

test("алгасах муж өгөөгүй бол бүх тохиолдлыг солино", () => {
  const out = replaceAllWord("helo ба helo", "helo", "hello", 0, "lower");
  assert.equal(out.text, "hello ба hello");
});

test("цэгээр салгахад холбоос, inline код доторх үгийг өөрчлөхгүй", () => {
  const text =
    "байна.Тэгээд\nhttps://example.mn/байна.Тэгээд\n`байна.Тэгээд` байна.Тэгээд";
  const out = splitEveryOccurrence(
    text,
    "байна.Тэгээд",
    [5],
    0,
    skipRanges(text, { code: true }),
  );
  assert.equal(
    out?.text,
    "байна. Тэгээд\nhttps://example.mn/байна.Тэгээд\n`байна.Тэгээд` байна. Тэгээд",
  );
  assert.equal(out?.caret, 13);
});

test("эхний үсгүүдийн цувааг бүх цэгийн ард зайтай санал болгоно", async () => {
  const none = async (): Promise<Record<string, boolean>> => ({});
  assert.deepEqual(await periodSplits("Ж.К.Роулингийн", none), [
    "Ж. К. Роулингийн",
  ]);
  assert.deepEqual(await periodSplits("Ж.Роулинг", none), ["Ж. Роулинг"]);
});

test("эхний үсгүүдийн цувааг текст даяар салгана", () => {
  const word = "Ж.К.Роулингийн";
  const dots = periodSplitDots(word, "Ж. К. Роулингийн");
  assert.deepEqual(dots, [1, 3]);
  const text = word + " ном, " + word + " бүтээл";
  const out = splitEveryOccurrence(text, word, dots, 0);
  assert.equal(out?.text, "Ж. К. Роулингийн ном, Ж. К. Роулингийн бүтээл");
  assert.equal(out?.caret, 16);
});
