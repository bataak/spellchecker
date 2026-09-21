import { test } from "node:test";
import assert from "node:assert/strict";
import { bunzip2, isBzip2 } from "../src/bzip2.ts";
import { untar } from "../src/tar.ts";
import {
  baseName,
  extractArchive,
  isArchiveName,
  isJunkEntry,
} from "../src/archive.ts";
import { expandArchive } from "../src/userdicts.ts";

const decode = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const encoder = new TextEncoder();

const MULTIBLOCK_BZ2 =
  "QlpoMTFBWSZTWbjHH2MAGazYSgAQQAB/4BCEKElgAFADvvAAAAgUaMgaNMjQo0ZA0aZGhRoyBo0yNBNVUmNPeqppAAFKqD1AZGjT1NlQQ91QQx4lOiprKcJV3RcRZF8ovaL0i+kX2RekWRZF8IsiyLIsiyLIsi6RZFkWRd0WRZFkWRZFkXlFkWRZFkXhFkWRZFkWReEWRZFkWRZF5RZFkWRZF3RZFkWRZFkWRdIsiyLIvhFkWRZFkWRZFkXpFkWRdkWRZFkWRZFkWRZFxFpFkWRZFkWRZFkX0i/vSLpF0i6RdIvaL2i9ovaL5yLsiyLIsiyLIsiyLIuSqMiyL4RZFkWRZFkWRZF6lUZFkWRd0WRZFkWRZFkXUqjIsiyLIvCLIsiyLIsi8yqMiyLIsiyLyiyLIsiyLxKo7IsiyLIsiyLIvSLIsi+JVHEXEXEXEXEXEXEXpFxF2lUcRcRcRcRcRcRcRcRcoVXEXEXEXEXEXEXEXEXKVGSkUXmpIovu1UEN1QQ3VBDkqCGaoIfqoIYqghhUEM1QQ/mKCskyms9CwuL4AvCewlAAggAD/wCEIUJLAAKAHfeAAABAo0ZA0aZGhRoyBo0yNCjRkDRpkaCaqoNTe9VKaAGClUh6gGjQ2ptVBD2qCHTvKc5TWU0lXEWRdIvaL7IvSL5RfdF6RZFkXdFkWRZFkWRZFkXxCyLIsi8IsiyLIsiyLIukWRZFkWReUWRZFkWRZF5RZFkWRZFkXSLIsiyLIvCLIsiyLIsiyL4RZFkWRd0WRZFkWRZFkWRekWRZF2RZFkWRZFkWRZFkXEWkWRZFkWRZFkWRfKLpF0i6RdIukXtF7Re0XtFxFkWRZFkWRZFkWRZFyVRkWRd4WRZFkWRZFkWReiqMiyLIvCLIsiyLIsiyL4lUZFkWRZF5RZFkWRZFkXUqjIsiyLIsi6RZFkWRZF5lUdkWRZFkWRZFkXpFkWRd5VHEXEXEXEXEXEXEXpFxF2lUcRcRcRcRcRcRcRcRcoVXEXEXEXEXEXEXEXEXBUZKRRZkqSWdEKgtlQQ3qgh+qghuqCGFQQ3qghiqCGKoIZVBD+YoKyTKayDc+YygDo4bCUACCAAP/AIQhQksAAoAd8AAAABRoyBo0yNCjRkDRpkaFGjIGjTI0KNGQNGmRoFKqQ2b1Uo0A0/VBRfmgovUHmD5Q8IdocQyHpD7IdofdD5Q7gyGQ9kMhkMhkMhkMh1BkMhkPdDIZDIZDIZDzBkMhkMh8IZDIZDIZD4QyGQyGQyHlDIZDIZD3QyGQyGQyGQ6QyGQ0HshoNBoNBoNBoO4NBoPCGg0Gg0Gg0Gg0HINQaDQaDQaDQaDv7wdIdIdIdIdIekPUHIPUHENBkMhkMhkNBoNBwkmQyHtBkMhkMhoNBoOySZDIZD3gyGQyGg0Gg6JJkMhkMh8IZDIaDQaDySTIZDIZDIeUMhoNBoPgkniDIZDIZDIZDtDQaD2ok4hxDiHEOIcQ5B2hyDwkTiHEOIcQ4hyDkHIOIe/gpTiHEOIcQ4h1ByDkHKivoRFH1CIo/NBRf2gov5QUX9oKL6AR34QQf5BRdIKLqgovqgov+LuSKcKEgapYSqA";
const TAR_BZ2 =
  "QlpoOTFBWSZTWee/eLYAASVfiM+RQIP/gkQ0HAB/75/AAAQESDAA+NrDSkYDEmIwBBgjTTAJgZRpTxR6mhpoaHqDQAADCCSUDRNGTIA0AAAANK/Hb50pDPEToYdNG+COW16VISMZVjxVUMmEPv1RQ30UBIIsMIB5CJ4+MkNCPCHkeaY0q880ndQ6BkShMkINxv38J0IpYGldebdog0wKp907nhzQKDZQNrngNjxc1bhIAxFTfYzxcZ6OfBlmN5QhLkCRTh3ACH2uRDnnpp/xMQXWBwhgjjFIggLa3WMWGSKIx7meVBtUHKZKbTLtNdcAXqIkpzRQG8QuyrFNChFkrWReZHZkfkYrdaNJkkzMjUWxAfxdyRThQkOe/eLY";

function expectedMultiblock(): Uint8Array {
  let text = "";
  for (let i = 0; i < 12000; i++) text += (i % 97) + " толь бичиг\n";
  return encoder.encode(text);
}

function header(name: string, size: number, type = "0"): Uint8Array {
  const block = new Uint8Array(512);
  block.set(encoder.encode(name).subarray(0, 100), 0);
  block.set(encoder.encode("0000644\0"), 100);
  block.set(encoder.encode(size.toString(8).padStart(11, "0") + "\0"), 124);
  block[156] = type.charCodeAt(0);
  block.set(encoder.encode("ustar\0" + "00"), 257);
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.set(encoder.encode(sum.toString(8).padStart(6, "0") + "\0 "), 148);
  return block;
}

function tarOf(files: [string, string, string?][]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [name, content, type] of files) {
    const data = encoder.encode(content);
    parts.push(header(name, data.length, type));
    const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
    padded.set(data);
    parts.push(padded);
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

test("олон блоктой bzip2-ийг задална", () => {
  const packed = decode(MULTIBLOCK_BZ2);
  assert.equal(isBzip2(packed), true);
  assert.deepEqual(bunzip2(packed), expectedMultiblock());
});

test("эвдэрсэн bzip2-д алдаа өгнө", () => {
  const packed = decode(MULTIBLOCK_BZ2);
  packed[40] ^= 0xff;
  assert.throws(() => bunzip2(packed));
});

test("tar-аас энгийн, GNU урт нэр, pax нэртэй файлуудыг гаргана", () => {
  const long = "dir/" + "x".repeat(120) + ".ifo";
  const entries = untar(
    tarOf([
      ["a/Toli.ifo", "ifo"],
      ["a/", "", "5"],
      ["././@LongLink", long, "L"],
      ["ignored", "long"],
      ["pax", "30 path=deep/path/Toli.syn\n", "x"],
      ["short", "syn"],
    ]),
  );
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["a/Toli.ifo", long, "deep/path/Toli.syn"],
  );
  assert.equal(new TextDecoder().decode(entries[2]!.data), "syn");
});

test("архивын нэр, хог файлыг таньна", () => {
  assert.equal(isArchiveName("stardict-mongoltoli.tar.bz2"), true);
  assert.equal(isArchiveName("x.tgz"), true);
  assert.equal(isArchiveName("x.zip"), true);
  assert.equal(isArchiveName("Toli.dict.dz"), false);
  assert.equal(isArchiveName("Toli.idx.gz"), false);
  assert.equal(baseName("a/b/Toli.ifo"), "Toli.ifo");
  assert.equal(isJunkEntry("__MACOSX/a/._Toli.ifo"), true);
  assert.equal(isJunkEntry("a/._Toli.ifo"), true);
});

test("tar.bz2 архиваас толины файлуудыг гаргана", async () => {
  const entries = await extractArchive("test.tar.bz2", decode(TAR_BZ2));
  assert.equal(entries.length, 4);
  const files = await expandArchive(
    new File([decode(TAR_BZ2)], "test.tar.bz2"),
  );
  assert.deepEqual(files.map((file) => file.name).sort(), [
    "Toli.dict",
    "Toli.idx",
    "Toli.ifo",
  ]);
  assert.equal(
    await files.find((file) => file.name === "Toli.dict")!.text(),
    "hello",
  );
});
