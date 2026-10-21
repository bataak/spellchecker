import test from "node:test";
import assert from "node:assert/strict";

import { runSave } from "./helpers/fileio-harness.ts";

test("fileio save: office идэвхтэй бол баримтыг хадгална", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  assert.deepEqual(await runSave({ officeActive: true }), {
    log: ["office.save"],
    label: "Хадгаллаа",
    handle: null,
  });
  const cancelled = await runSave({ officeActive: true, officeSave: false });
  assert.equal(cancelled.label, "Цуцаллаа");
  const failed = await runSave({ officeActive: true, officeSave: "throw" });
  assert.equal(failed.label, "Боломжгүй");
});

test("fileio save: гар утасны PDF ба төслийн хадгалалт эхэлнэ", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  assert.deepEqual((await runSave({ pdfApplies: true })).log, ["pdf.save"]);
  const project = await runSave({ projectLabel: "Төсөл хадгаллаа" });
  assert.deepEqual(project.log, ["project.save"]);
  assert.equal(project.label, "Төсөл хадгаллаа");
  const broken = await runSave({ projectLabel: "throw" });
  assert.deepEqual(broken.log, ["project.save"]);
  assert.equal(broken.label, "Боломжгүй");
});

test("fileio save: нээсэн файлын handle уруу бичнэ", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const ok = await runSave({ fileName: "a.md", handle: "ok", text: "x" });
  assert.deepEqual(ok.log, [
    "project.save",
    "write:a.md:x",
    "close:a.md",
    "saved:true",
  ]);
  assert.equal(ok.label, "Хадгаллаа");
  const denied = await runSave({ fileName: "a.md", handle: "fail", text: "x" });
  assert.deepEqual(denied.log, [
    "project.save",
    "deliver:a.md:x",
    "saved:false",
  ]);
  assert.equal(denied.label, "Хадгалав");
});

test("fileio save: хоосон, нэргүй бичвэрийг хадгалахгүй", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const empty = await runSave({ text: "  " });
  assert.deepEqual(empty.log, ["project.save"]);
  assert.equal(empty.label, "Хоосон байна");
});

test("fileio save: суурилуулсан ап дээр FS picker ашиглана", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const picked = await runSave({ desktop: true, picker: "ok", text: "y" });
  assert.deepEqual(picked.log, [
    "project.save",
    "picker",
    "write:picked.txt:y",
    "close:picked.txt",
    "saved:true",
  ]);
  assert.equal(picked.handle, "picked.txt");
  const aborted = await runSave({ desktop: true, picker: "abort" });
  assert.deepEqual(aborted.log, ["project.save", "picker"]);
  assert.equal(aborted.label, null);
  const failed = await runSave({ desktop: true, picker: "fail", text: "z" });
  assert.match(failed.log.at(-1)!, /^deliver:бичвэр-1970-01-01-\d{4}\.md:z$/);
  assert.equal(failed.label, "Хадгаллаа");
});

test("fileio saveSource: төслийн файлыг onSaved дуудалгүй хүргэнэ", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const out = await runSave({
    fileName: "main.tex",
    handle: "ok",
    pdfApplies: true,
    source: { name: "main.tex", inProject: true },
    text: "t",
  });
  assert.deepEqual(out.log, ["deliver:main.tex:t"]);
  assert.equal(out.label, "Хадгалав");
});
