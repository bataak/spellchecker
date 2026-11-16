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

test("CMAP: эгшиг зохицол болон үндсийн эгшгийн алдааг засна", async () => {
  const hunspell = await createHunspellFromFiles(dict + ".aff", dict + ".dic");
  await hunspell.loadFrequenciesFromFile(dict + ".freq");
  try {
    assert.ok(hunspell.testSpelling("түвдэхдээ"));
    assert.ok(
      hunspell.getSpellingSuggestions("төвдөхдөө").includes("түвдэхдээ"),
    );
    assert.equal(hunspell.getSpellingSuggestions("үзөх")[0], "үзэх");
  } finally {
    hunspell.dispose();
  }
});
