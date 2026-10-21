import { test } from "node:test";
import assert from "node:assert/strict";
import { createDictLookup } from "../src/dict/dictlookup.ts";
import {
  openStarDict,
  stardictCompare,
  type StarDict,
} from "../src/dict/stardict.ts";
import type { DictBytes } from "../src/dict/dictbytes.ts";

const encoder = new TextEncoder();

function buildDict(name: string, entries: [string, string][]): StarDict {
  const sorted = [...entries].sort(([left], [right]) =>
    stardictCompare(left, right),
  );
  const idx: number[] = [];
  const body: number[] = [];
  for (const [word, text] of sorted) {
    const bytes = encoder.encode(text);
    const tail = new DataView(new ArrayBuffer(8));
    tail.setUint32(0, body.length);
    tail.setUint32(4, bytes.length);
    idx.push(...encoder.encode(word), 0, ...new Uint8Array(tail.buffer));
    body.push(...bytes);
  }
  const data = Uint8Array.from(body);
  const ifo = `StarDict's dict ifo file\nversion=3.0.0\nbookname=${name}\nwordcount=${sorted.length}\nsametypesequence=m\n`;
  return openStarDict(ifo, Uint8Array.from(idx), {
    size: data.length,
    read: async (offset: number, size: number) =>
      data.subarray(offset, offset + size),
  } as DictBytes);
}

const first = buildDict("Нэгдүгээр", [["НОМ", "номын тайлбар"]]);
const second = buildDict("Хоёрдугаар", [
  ["НОМ", "өөр тайлбар"],
  ["ҮГ", "үгийн тайлбар"],
]);

const setup = (dicts: StarDict[]) =>
  createDictLookup({
    store: {
      withDicts: (run) => run(dicts, []),
    },
    words: {
      analysesFor: () => [],
      stemsOf: (word) => (word === "номыг" ? ["ном"] : []),
      infinitivesOfStem: () => [],
      lookupModeOf: () => "any",
    },
  });

test("dictlookup үгийн толгой үгийг эхний олдсон толиноос авна", async () => {
  const lookup = setup([first, second]);
  const found = await lookup.headwords(["номыг", "үг", "алга"]);
  assert.equal(found?.["номыг"]?.toLowerCase(), "ном");
  assert.equal(found?.["үг"]?.toLowerCase(), "үг");
  assert.equal(found?.["алга"], undefined);
  assert.equal(await setup([]).headwords(["ном"]), null);
});

test("dictlookup тайлбарыг бүх толиноос эх сурвалжтай нь цуглуулна", async () => {
  const entries = await setup([first, second]).define("ном");
  assert.deepEqual(
    entries.map((entry) => entry.source),
    ["Нэгдүгээр", "Хоёрдугаар"],
  );
  assert.match(entries[0]!.text, /номын тайлбар/);
});
