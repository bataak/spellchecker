import test from "node:test";
import assert from "node:assert/strict";

import { memoryBytes } from "../src/dictbytes.ts";
import {
  defineWord,
  hasEntry,
  findHeadword,
  openStarDict,
  resolveDefinitions,
} from "../src/stardict.ts";

const encoder = new TextEncoder();

function buildIdx(entries: { word: string; offset: number; size: number }[]) {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    const word = encoder.encode(entry.word);
    const row = new Uint8Array(word.length + 1 + 8);
    row.set(word, 0);
    const view = new DataView(row.buffer);
    view.setUint32(word.length + 1, entry.offset);
    view.setUint32(word.length + 5, entry.size);
    parts.push(row);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const dictText = encoder.encode("бичсэн зүйлзаадаг хүн");
const entries = [
  { word: "НОМ", offset: 0, size: 21 },
  { word: "багш", offset: 21, size: 19 },
];
const ifo =
  "StarDict's dict ifo file\nversion=3.0.0\nbookname=Тест\n" +
  "wordcount=2\nidxfilesize=1\nsametypesequence=m\n";

const dict = openStarDict(ifo, buildIdx(entries), memoryBytes(dictText));

test("defineWord — async тайлбар буцаана", async () => {
  const found = await defineWord(dict, "ном");
  assert.equal(found.length, 1);
  assert.equal(found[0]!.headword, "НОМ");
  assert.equal(found[0]!.text, "бичсэн зүйл");
});

test("hasEntry, findHeadword синхрон хэвээр", () => {
  assert.equal(hasEntry(dict, "ном"), true);
  assert.equal(hasEntry(dict, "усан"), false);
  assert.equal(findHeadword(dict, "ном", () => []), "НОМ");
  assert.equal(findHeadword(dict, "номын", () => ["ном"]), "НОМ");
});

test("resolveDefinitions — стемээр олно", async () => {
  const byStem = await resolveDefinitions(dict, "номын", () => ["ном"]);
  assert.equal(byStem[0]!.headword, "НОМ");
  const none = await resolveDefinitions(dict, "усан", () => ["ус"]);
  assert.deepEqual(none, []);
});

test("хилээс хэтэрсэн бичлэгийг алгасна", async () => {
  const oneWordIfo = ifo.replace("wordcount=2", "wordcount=1");
  const broken = openStarDict(
    oneWordIfo,
    buildIdx([{ word: "НОМ", offset: 0, size: 9999 }]),
    memoryBytes(dictText),
  );
  assert.deepEqual(await defineWord(broken, "ном"), []);
});
