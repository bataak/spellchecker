import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceAllWord } from "../src/wordfix.ts";
import { skipRanges } from "../src/codeskip.ts";

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

test("алгасах муж өгөөгүй бол бүх тохиолдлыг сольно", () => {
  const out = replaceAllWord("helo ба helo", "helo", "hello", 0, "lower");
  assert.equal(out.text, "hello ба hello");
});
