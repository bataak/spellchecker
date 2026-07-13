import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unionChain } from "../src/morphology.ts";

const here = dirname(fileURLToPath(import.meta.url));

function affSuffixes() {
  const aff = readFileSync(
    join(here, "..", "public", "dict", "mn_MN.aff"),
    "utf8",
  );
  const out = new Set();
  for (const line of aff.split("\n")) {
    if (!line.startsWith("SFX ")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const append = parts[3].split("/")[0];
    if (append && append !== "0") out.add(append);
  }
  return [...out];
}

test("mn_MN.aff файлын бүх нөхцөлийн хоршилд хүчинтэй", () => {
  const suffixes = affSuffixes();
  assert.ok(suffixes.length > 3000, "aff файлаас нөхцөл олдсонгүй");
  const fails = suffixes.filter((s) => !unionChain(String(s), ""));
  assert.deepEqual(fails, []);
});
