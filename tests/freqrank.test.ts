import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHunspellFromFiles } from "../vendor/hunspell-wasm/dist/Hunspell.js";

const dict = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "dict",
  "mn_MN",
);

const cases: [string, string, number][] = [
  ["бүйлс", "буйлс", 1],
  ["халимны", "халимын", 1],
  ["гуталаар", "гутлаар", 1],
  ["Аялалын", "Аяллын", 1],
  ["үзөх", "үзэх", 1],
  ["эрсдэлтэй", "эрстэлтэй", 2],
  ["төвдөхдөө", "түвдэхдээ", 2],
  ["түвшин", "төвшин", 1],
];

test("давтамжаар эрэмбэлэхэд зөв хэлбэр дээгүүр гарна", async () => {
  const hunspell = await createHunspellFromFiles(dict + ".aff", dict + ".dic");
  await hunspell.loadFrequenciesFromFile(dict + ".freq");
  try {
    for (const [typo, word, rank] of cases) {
      const index = hunspell.getSpellingSuggestions(typo).indexOf(word);
      assert.ok(
        index >= 0 && index < rank,
        `${typo} → ${word}: ${index + 1}-р байр`,
      );
    }
  } finally {
    hunspell.dispose();
  }
});
