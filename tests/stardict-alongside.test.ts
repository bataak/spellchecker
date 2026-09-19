import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openStarDict,
  resolveDefinitions,
  stardictCompare,
} from "../src/stardict.ts";
import type { DictBytes } from "../src/dictbytes.ts";

const encoder = new TextEncoder();

function buildDict(entries: [string, string][]) {
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
  const ifo = `StarDict's dict ifo file\nversion=3.0.0\nbookname=Тест\nwordcount=${sorted.length}\nsametypesequence=m\n`;
  return openStarDict(ifo, Uint8Array.from(idx), {
    size: data.length,
    read: async (offset: number, size: number) =>
      data.subarray(offset, offset + size),
  } as DictBytes);
}

const dict = buildDict([
  ["АГУУЛ", "агуулын тайлбар"],
  ["АГУУЛАХ", "агуулахын тайлбар"],
  ["ЧУУЛАХ", "чуулахын тайлбар"],
]);

test("яг таарсан бичлэгийн араас үйлт нэрийн бичлэгийг нэмнэ", async () => {
  const entries = await resolveDefinitions(
    dict,
    "агуул",
    () => ["агуулах"],
    "any",
    () => ["агуулах"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.headword),
    ["АГУУЛ", "АГУУЛАХ"],
  );
});

test("яг таарсан бичлэг байхгүй бол язгуураар хайна", async () => {
  const entries = await resolveDefinitions(
    dict,
    "чуул",
    () => ["чуулах"],
    "any",
    () => ["чуулах"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.headword),
    ["ЧУУЛАХ"],
  );
});

test("нэмэлт үйлт нэр өгөөгүй бол өмнөх үйлдэл хэвээр", async () => {
  const entries = await resolveDefinitions(dict, "агуул", () => ["агуулах"]);
  assert.deepEqual(
    entries.map((entry) => entry.headword),
    ["АГУУЛ"],
  );
});
