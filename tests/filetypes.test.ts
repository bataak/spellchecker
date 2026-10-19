import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTextFile,
  looksOffice,
  restoredName,
  saveTypes,
  sizeVerdict,
  stampName,
  textMime,
  textName,
} from "../src/files/filetypes.ts";

const file = (name: string, type = "") => ({ name, type });

test("stampName огноо, өргөтгөлтэй нэр үүсгэнэ", () => {
  const now = new Date(2026, 9, 19, 8, 5);
  assert.equal(stampName("md", false, now), "бичвэр-2026-10-19-0805.md");
  assert.equal(stampName("tex", true, now), "2026-10-19-0805.tex");
});

test("textName өргөтгөлгүй нэрт өргөтгөл нэмж, хоосонд огноо өгнө", () => {
  const stamp = () => "огноо.txt";
  assert.equal(textName("тайлан", "md", stamp), "тайлан.md");
  assert.equal(textName(" a.tex ", "md", stamp), "a.tex");
  assert.equal(textName("  ", "md", stamp), "огноо.txt");
});

test("textMime өргөтгөлөөр төрөл сонгоно", () => {
  assert.equal(textMime("a.tex"), "text/x-tex;charset=utf-8");
  assert.equal(textMime("a.md"), "text/markdown;charset=utf-8");
  assert.equal(textMime("a.txt"), "text/plain;charset=utf-8");
});

test("saveTypes өргөтгөлд тохирох сонголтыг өгнө", () => {
  assert.deepEqual(Object.values(saveTypes("tex")[0]!.accept), [[".tex"]]);
  assert.deepEqual(Object.values(saveTypes("md")[0]!.accept), [[".md"]]);
  assert.deepEqual(Object.values(saveTypes("other")[0]!.accept), [[".txt"]]);
});

test("looksOffice болон isTextFile файлын төрлийг ялгана", () => {
  assert.equal(looksOffice(file("a.DOCX")), true);
  assert.equal(looksOffice(file("x", "application/pdf")), true);
  assert.equal(looksOffice(file("a.txt", "text/plain")), false);
  assert.equal(isTextFile(file("a.md")), true);
  assert.equal(isTextFile(file("a.bin", "text/csv")), true);
  assert.equal(isTextFile(file("a.png", "image/png")), false);
  assert.equal(isTextFile(null), false);
});

test("sizeVerdict файлын хэмжээг ангилна", () => {
  assert.equal(sizeVerdict(1024), "ok");
  assert.equal(sizeVerdict(3 * 1024 * 1024), "big");
  assert.equal(sizeVerdict(11 * 1024 * 1024), "too-big");
});

test("restoredName Word файлын нэрийг бичвэрийн нэр болгоно", () => {
  assert.equal(
    restoredName({ name: "тайлан.docx", kind: "office" }),
    "тайлан.txt",
  );
  assert.equal(restoredName({ name: "a.md", kind: "text" }), "a.md");
});
