import test from "node:test";
import assert from "node:assert/strict";

import { buildDictZip, inflateChunk } from "./dictzipfixture.ts";
import {
  chunkIndexAt,
  createDictZipReader,
  parseDictZip,
  terminate,
  type DictZip,
} from "../src/dictzip.ts";

const CHUNK = 64;

const plain = new TextEncoder().encode(
  Array.from({ length: 40 }, (_, i) => "мөр " + i + " номын тайлбар").join(
    "\n",
  ),
);
const file = await buildDictZip(plain, CHUNK);

const reader = (zip: DictZip, counter?: { reads: number }) =>
  createDictZipReader(
    zip,
    async (start, end) => {
      if (counter) counter.reads += 1;
      return file.subarray(start, end);
    },
    inflateChunk,
  );

test("parseDictZip — RA толгойг уншина", () => {
  const zip = parseDictZip(file);
  assert.ok(zip);
  assert.equal(zip.chunkLength, CHUNK);
  assert.equal(zip.sizes.length, Math.ceil(plain.length / CHUNK));
  assert.equal(zip.starts[0], zip.dataStart);
  assert.equal(zip.starts[1], zip.dataStart + zip.sizes[0]!);
});

test("parseDictZip — FNAME-гүй файл", async () => {
  const zip = parseDictZip(await buildDictZip(plain, CHUNK, null));
  assert.ok(zip);
  assert.equal(zip.chunkLength, CHUNK);
});

test("parseDictZip — dictzip биш файлд null", () => {
  assert.equal(parseDictZip(new Uint8Array([0x1f, 0x8b, 0x08, 0x00])), null);
  assert.equal(parseDictZip(new Uint8Array(4)), null);
  assert.equal(parseDictZip(file.subarray(0, 14)), null);
});

test("Z_FULL_FLUSH хэсгийг дуусгавар нэмж задална", () => {
  const zip = parseDictZip(file)!;
  const start = zip.starts[1]!;
  const packed = file.subarray(start, start + zip.sizes[1]!);
  assert.throws(() => inflateChunk(packed));
  assert.deepEqual(
    inflateChunk(terminate(packed)),
    plain.subarray(CHUNK, CHUNK * 2),
  );
});

test("уншилт бүх мужид эх өгөгдөлтэй таарна", async () => {
  const zip = parseDictZip(file)!;
  const read = reader(zip);
  for (const [offset, size] of [
    [0, 10],
    [CHUNK - 5, 10],
    [CHUNK, CHUNK],
    [CHUNK * 2 + 7, CHUNK * 2],
    [plain.length - 3, 3],
  ] as const) {
    assert.deepEqual(
      await read(offset, size),
      plain.subarray(offset, offset + size),
      offset + "/" + size,
    );
  }
});

test("хэсэг дамжсан уншилт", async () => {
  const zip = parseDictZip(file)!;
  const counter = { reads: 0 };
  const read = reader(zip, counter);
  const out = await read(CHUNK - 2, 6);
  assert.deepEqual(out, plain.subarray(CHUNK - 2, CHUNK + 4));
  assert.equal(counter.reads, 2);
});

test("cache — ижил хэсгийг дахин уншихгүй", async () => {
  const zip = parseDictZip(file)!;
  const counter = { reads: 0 };
  const read = reader(zip, counter);
  await read(0, 8);
  await read(8, 8);
  await read(16, 8);
  assert.equal(counter.reads, 1);
});

test("хоосон ба хилээс гарсан хүсэлт", async () => {
  const zip = parseDictZip(file)!;
  const read = reader(zip);
  assert.equal((await read(10, 0)).length, 0);
  await assert.rejects(() => read(zip.chunkLength * zip.sizes.length, 4));
});

test("chunkIndexAt", () => {
  const zip = parseDictZip(file)!;
  assert.equal(chunkIndexAt(zip, 0), 0);
  assert.equal(chunkIndexAt(zip, CHUNK - 1), 0);
  assert.equal(chunkIndexAt(zip, CHUNK), 1);
});
