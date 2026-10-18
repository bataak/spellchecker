import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isXz, unxz } from "../src/archive/xz.ts";

const xz = (input: Uint8Array, args: string[]): Uint8Array =>
  new Uint8Array(
    execFileSync("xz", ["-c", ...args], { input, maxBuffer: 1 << 28 }),
  );

function sample(): Uint8Array {
  const words = ["монгол", "\\usepackage", "{tikz}", "хэл", "pgf", "%", "\n"];
  let text = "";
  let seed = 7;
  for (let i = 0; i < 60000; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    text += words[seed % words.length] + " ";
  }
  return new TextEncoder().encode(text);
}

const TEXT = sample();
const RANDOM = new Uint8Array(randomBytes(200000));
const REPEAT = new Uint8Array(3 << 20).fill(0x61);

test("xz-ийн бүх түвшинг задлана", () => {
  for (const level of ["-0", "-1", "-6", "-9", "-9e"])
    assert.deepEqual(unxz(xz(TEXT, [level])), TEXT, level);
});

test("CRC32, CRC64, SHA-256 ба шалгалтгүй урсгалыг задлана", () => {
  for (const check of ["none", "crc32", "crc64", "sha256"])
    assert.deepEqual(unxz(xz(TEXT, ["--check=" + check])), TEXT, check);
});

test("олон блок ба нийлүүлсэн урсгалыг задлана", () => {
  assert.deepEqual(unxz(xz(TEXT, ["--block-size=4096"])), TEXT);
  const first = xz(TEXT, []);
  const second = xz(RANDOM, ["--check=crc32"]);
  const joined = new Uint8Array(first.length + 8 + second.length);
  joined.set(first, 0);
  joined.set(second, first.length + 8);
  const both = new Uint8Array(TEXT.length + RANDOM.length);
  both.set(TEXT, 0);
  both.set(RANDOM, TEXT.length);
  assert.deepEqual(unxz(joined), both);
});

test("lc, lp, pb-ийн өөр утгуудыг задлана", () => {
  for (const opts of [
    "lc=0,lp=0,pb=0",
    "lc=4,lp=0,pb=4",
    "lc=0,lp=4,pb=2",
    "lc=1,lp=3,pb=1",
  ])
    assert.deepEqual(unxz(xz(TEXT, ["--lzma2=preset=6," + opts])), TEXT, opts);
});

test("шахагдахгүй, давтагдсан ба хоосон өгөгдлийг задлана", () => {
  assert.deepEqual(unxz(xz(RANDOM, [])), RANDOM);
  assert.deepEqual(unxz(xz(REPEAT, ["-9"])), REPEAT);
  assert.deepEqual(unxz(xz(new Uint8Array(0), [])), new Uint8Array(0));
});

test("гэмтсэн өгөгдлийг хүлээж авахгүй", () => {
  const packed = xz(TEXT, []);
  assert.ok(isXz(packed));
  assert.ok(!isXz(TEXT));
  assert.throws(() => unxz(TEXT), /xz:/);
  assert.throws(() => unxz(packed.slice(0, packed.length >> 1)), /xz:/);
  for (const at of [40, packed.length >> 1, packed.length - 30]) {
    const broken = packed.slice();
    broken[at] ^= 0x55;
    assert.throws(() => unxz(broken), /xz:/, String(at));
  }
});
