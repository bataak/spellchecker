import test from "node:test";
import assert from "node:assert/strict";

import { buildDictZip, inflateChunk } from "./dictzipfixture.ts";
import {
  isizeOf,
  memoryBytes,
  openDictBytes,
  rangeBytes,
} from "../src/dictbytes.ts";

const CHUNK = 32;

const plain = new TextEncoder().encode(
  "ном: бичсэн зүйл. номын сан: ном хадгалах газар. багш: заадаг хүн.",
);

test("memoryBytes", async () => {
  const bytes = memoryBytes(plain);
  assert.equal(bytes.size, plain.length);
  assert.deepEqual(await bytes.read(5, 4), plain.subarray(5, 9));
});

test("rangeBytes", async () => {
  const bytes = rangeBytes(plain.length, async (start, end) =>
    plain.subarray(start, end),
  );
  assert.deepEqual(await bytes.read(2, 6), plain.subarray(2, 8));
});

test("isizeOf — gzip сүүлээс задарсан урт", () => {
  const tail = new Uint8Array(8);
  new DataView(tail.buffer).setUint32(4, 123456, true);
  assert.equal(isizeOf(tail), 123456);
  assert.equal(isizeOf(new Uint8Array(2)), 0);
});

test("openDictBytes — dictzip файлыг хэсгээр уншина", async () => {
  const file = await buildDictZip(plain, CHUNK);
  const bytes = await openDictBytes(
    async (start, end) => file.subarray(start, end),
    file.length,
    inflateChunk,
  );
  assert.equal(bytes.size, plain.length);
  assert.deepEqual(await bytes.read(0, 3), plain.subarray(0, 3));
  assert.deepEqual(
    await bytes.read(CHUNK - 2, 8),
    plain.subarray(CHUNK - 2, CHUNK + 6),
  );
  assert.deepEqual(
    await bytes.read(plain.length - 5, 5),
    plain.subarray(plain.length - 5),
  );
});

test("openDictBytes — энгийн .dict файлыг шууд уншина", async () => {
  const bytes = await openDictBytes(
    async (start, end) => plain.subarray(start, end),
    plain.length,
    () => {
      throw new Error("задлах ёсгүй");
    },
  );
  assert.equal(bytes.size, plain.length);
  assert.deepEqual(await bytes.read(4, 4), plain.subarray(4, 8));
});
