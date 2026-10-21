import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyScan,
  dropEntries,
  markZipped,
  moveEntries,
  putDir,
  putFile,
  snapshotOf,
} from "../src/project/projectedit.ts";
import { newState } from "../src/project/projectstate.ts";

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n";
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const memory = () =>
  newState(1, "memory", "төсөл", null, [["main.tex", bytes(MAIN)]], []);

test("файл нэмэхэд эцэг хавтаснууд үүсэж, текстийг хадгалсанд тооцно", () => {
  const s = memory();
  putFile(s, "ch/body.tex", bytes("бие\r\nмөр"));
  assert.equal(s.texts.get("ch/body.tex"), "бие\nмөр");
  assert.ok(s.crlf.has("ch/body.tex"));
  assert.ok(s.dirs.has("ch"));
  assert.equal(s.dirty.size, 0);
  assert.equal(s.unsynced, true);
});

test("хавтас зөөхөд дотор нь байгаа файл, үндсэн файл хамт шилжинэ", () => {
  const s = memory();
  putDir(s, "a/b");
  putFile(s, "a/b/x.tex", bytes("х"));
  moveEntries(s, "a", "c");
  assert.deepEqual([...s.dirs].sort(), ["c", "c/b"]);
  assert.equal(s.texts.get("c/b/x.tex"), "х");
  moveEntries(s, "main.tex", "root.tex");
  assert.equal(s.main, "root.tex");
});

test("устгахад доторх бүх зүйл арилж, идэвхтэй файл цэвэрлэгдэнэ", () => {
  const s = memory();
  putFile(s, "a/x.tex", bytes("х"));
  s.active = "a/x.tex";
  dropEntries(s, "a");
  assert.equal(s.texts.has("a/x.tex"), false);
  assert.equal(s.dirs.has("a"), false);
  assert.equal(s.active, null);
});

test("дискний скан засаагүй файлыг шинэчилж, засварыг хадгална", () => {
  const s = memory();
  putFile(s, "a.tex", bytes("а"));
  putFile(s, "b.tex", bytes("б"));
  s.texts.set("b.tex", "засвар");
  s.dirty.add("b.tex");
  const changed = applyScan(s, {
    files: [
      ["a.tex", bytes("шинэ")],
      ["b.tex", bytes("дискэн")],
    ],
    same: ["main.tex"],
    dirs: [],
    stamps: new Map(),
  });
  assert.equal(changed, true);
  assert.equal(s.texts.get("a.tex"), "шинэ");
  assert.equal(s.texts.get("b.tex"), "засвар");
  assert.equal(s.saved.get("b.tex"), "дискэн");
  assert.ok(s.dirty.has("b.tex"));
});

test("zip болгосны дараа хийсэн засвар хадгалагдаагүй хэвээр үлдэнэ", () => {
  const s = memory();
  s.texts.set("main.tex", MAIN + "1");
  const snap = snapshotOf(s);
  s.texts.set("main.tex", MAIN + "2");
  markZipped(s, snap);
  assert.equal(s.saved.get("main.tex"), MAIN + "1");
  assert.equal(s.unsynced, true);
  assert.ok(s.dirty.has("main.tex"));
});
