import { test } from "node:test";
import assert from "node:assert/strict";
import { stripExt, withExt } from "../src/export/exportformats.ts";

test("цэгтэй нэрт өргөтгөл нэмнэ", () => {
  assert.equal(withExt("тайлан 12.10", "txt"), "тайлан 12.10.txt");
  assert.equal(withExt("тайлан", "pdf"), "тайлан.pdf");
  assert.equal(withExt("тайлан.pdf", "pdf"), "тайлан.pdf");
});

test("зөвхөн мэдэгдэх өргөтгөлийг хасна", () => {
  assert.equal(stripExt("report.final.txt"), "report.final");
  assert.equal(stripExt(stripExt("report.final.txt")), "report.final");
  assert.equal(stripExt("тайлан 1.2.txt"), "тайлан 1.2");
  assert.equal(stripExt("баримт.docx"), "баримт");
});

test("mdown өргөтгөлийг мэдэгдэх өргөтгөлд тооцно", () => {
  assert.equal(stripExt("notes.mdown"), "notes");
  assert.equal(withExt("notes.mdown", "md"), "notes.mdown");
});
