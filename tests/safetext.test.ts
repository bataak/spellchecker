import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanName,
  cleanText,
  revealText,
  unsafeName,
} from "../src/collab/safetext.ts";

const esc = (code: number): string => String.fromCharCode(code);

test("нэрээс чиглэл, үл харагдах, удирдах тэмдэгтийг хасна", () => {
  const rlo = esc(0x202e);
  const zwsp = esc(0x200b);
  const zwj = esc(0x200d);
  assert.equal(cleanName("Б" + rlo + "ат" + zwsp + zwj, 40), "Бат");
  assert.equal(cleanName("  Бат" + esc(0) + "\n\tДорж  ", 40), "Бат Дорж");
  assert.equal(cleanName("е" + esc(0x308), 40), "ё");
  assert.equal(cleanName("а".repeat(50), 40).length, 40);
  assert.equal(cleanName(esc(0xd800) + "Бат" + esc(0xdc00), 40), "Бат");
});

test("текстэд мөр, emoji-г үлдээж, binary болон zalgo-г хасна", () => {
  const family = "👨" + esc(0x200d) + "👩";
  assert.equal(cleanText("а\tб\nв " + family), "а б\nв " + family);
  assert.equal(
    cleanText(
      "x" + esc(0) + esc(7) + esc(0x1b) + esc(0x85) + esc(0xfffe) + "y",
    ),
    "xy",
  );
  assert.equal(cleanText("а\n\n\n\n\nб"), "а\n\nб");
  const zalgo = "о" + esc(0x301).repeat(50);
  assert.equal(cleanText(zalgo).length, 4);
  assert.equal(cleanText(esc(0x202e) + "abc" + esc(0x2066)), "abc");
});

test("өөрчлөлтөд үл харагдах тэмдэгтийг тодоор харуулна", () => {
  const mark = esc(0xfffd);
  assert.equal(revealText("а" + esc(0x200b) + "б"), "а" + mark + "б");
  assert.equal(revealText(esc(0x202e) + esc(0) + "\n"), mark + mark + "\n");
  assert.equal(revealText(esc(0xdc00)), mark);
});

test("файлын нэрэнд нуугдмал тэмдэгт байгаа эсэхийг илрүүлнэ", () => {
  for (const name of ["Хамтын бичвэр.txt", "a\u0301.md", "\u{1F600}.tex"])
    assert.equal(unsafeName(name), false, name);
  for (const name of [
    "a\u202E.txt",
    "a\u200B.md",
    "a\u0085.tex",
    "a\uD800.txt",
  ])
    assert.equal(unsafeName(name), true, name);
  assert.equal(cleanName("ab\u{1F600}", 3), "ab");
});
