import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlotHash, slotHash } from "../src/app/slothash.ts";
import {
  TEXT_LINK_MAX,
  readTextHash,
  textHash,
} from "../src/files/textlink.ts";
import { cleanText, decodeStrict } from "../src/files/safetext.ts";
import { toBase64Url } from "../src/collab/collabkey.ts";

test("талбарын хэш англи нэрээр бичигдэж, буцаж уншигдана", () => {
  for (const target of [
    { kind: "template", id: "plain" },
    { kind: "template", id: "letter" },
    { kind: "project", path: null },
    { kind: "project", path: "бүлэг/оршил.tex" },
    { kind: "file", name: "тайлан 1.md" },
  ] as const)
    assert.deepEqual(parseSlotHash(slotHash(target)), target);
  assert.equal(slotHash({ kind: "template", id: "plain2" }), "#plain2");
  assert.equal(
    slotHash({ kind: "project", path: "a b/c.tex" }),
    "#project/a%20b/c.tex",
  );
});

test("танихгүй эсвэл аюултай талбарын хэшийг үл тооно", () => {
  for (const hash of [
    "",
    "plain",
    "#unknown",
    "#plain/extra",
    "#project/../x.tex",
    "#project/a//b",
    "#project/%E0%A4%A",
    "#file/a/b.md",
    "#file/",
    "#j=abc.def",
    "#text=abc",
    "#" + "a".repeat(3000),
  ])
    assert.equal(parseSlotHash(hash), null, hash);
});

test("бичвэрийг холбоосонд шахаж, буцааж задлана", async () => {
  const text = "Сайн байна уу?\n\tДараагийн мөр — тест.";
  const hash = await textHash(text, "тэмдэглэл.md");
  assert.ok(hash?.startsWith("#text="));
  assert.deepEqual(await readTextHash(hash!), {
    text,
    name: "тэмдэглэл.md",
  });
  const plain = await textHash("а", null);
  assert.deepEqual(await readTextHash(plain!), { text: "а", name: null });
});

test("2000 тэмдэгтээс урт бичвэрт холбоос үүсгэхгүй", async () => {
  assert.equal(await textHash("", null), null);
  assert.ok(await textHash("ы".repeat(TEXT_LINK_MAX), null));
  assert.equal(await textHash("ы".repeat(TEXT_LINK_MAX + 1), null), null);
});

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

test("хуурамч, хэт урт эсвэл хортой холбоосыг уншихгүй", async () => {
  const bomb = await deflate(new Uint8Array(1_000_000).fill(65));
  const long = await deflate(new TextEncoder().encode("ы".repeat(2001)));
  const binary = await deflate(new Uint8Array([65, 0, 66]));
  const broken = await deflate(new Uint8Array([0xff, 0xfe, 0x41]));
  for (const hash of [
    "#text=" + bomb,
    "#text=" + long,
    "#text=" + binary,
    "#text=" + broken,
    "#text=@@@",
    "#text=AAAA",
    "#text=" + "A".repeat(13_000),
  ])
    assert.equal(await readTextHash(hash), null, hash.slice(0, 30));
  const good = await textHash("бичвэр", null);
  for (const name of ["a.exe", "..%2Fa.md", "a%E2%80%AEdm.txt", "%"])
    assert.deepEqual(await readTextHash(good + "&name=" + name), {
      text: "бичвэр",
      name: null,
    });
});

test("нуугдмал болон bidi тэмдэгтийг цэвэрлэж, binary-г татгалзана", () => {
  assert.equal(
    cleanText("а\u202Eб\u200Bв\u2066г\uFEFF\u0007д\tе\r\nё"),
    "абвгд\tе\r\nё",
  );
  assert.equal(decodeStrict(new Uint8Array([0x41, 0x00])), null);
  assert.equal(decodeStrict(new Uint8Array([0xc3, 0x28])), null);
  assert.equal(decodeStrict(new TextEncoder().encode("\uFEFFСайн")), "Сайн");
});
