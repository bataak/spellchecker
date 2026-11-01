import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "fflate";
import { inflateCapped } from "../src/collab/inflatecap.ts";

test("задаргаа хязгаар дотор бол анхны өгөгдлийг буцаана", () => {
  const plain = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
  assert.deepEqual(inflateCapped(deflateSync(plain), 1_000_000), plain);
  assert.deepEqual(
    inflateCapped(deflateSync(new Uint8Array(0)), 10),
    new Uint8Array(0),
  );
});

test("хязгаараас том болж задрах өгөгдлийг хүлээж авахгүй", () => {
  const bomb = deflateSync(new Uint8Array(20_000_000));
  assert.equal(inflateCapped(bomb, 1_000_000), null);
});

test("тасархай эсвэл гажуудсан өгөгдөлд алдаа өгнө", () => {
  const packed = deflateSync(new Uint8Array(100_000).fill(7));
  assert.throws(() => inflateCapped(packed.subarray(0, packed.length - 4), 1e6));
  assert.throws(() => inflateCapped(new Uint8Array([255, 255, 255]), 1e6));
});
