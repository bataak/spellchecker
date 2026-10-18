import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeDir } from "./helpers/fake-fs.ts";
import {
  addFile,
  createDir,
  openDirHandle,
  project,
  projectHas,
  projectText,
  renamePath,
  setProjectText,
} from "../src/projectstore.ts";

(globalThis as { window?: unknown }).window ??= globalThis;

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n";

test("хавтасны нэр солиход далд болон build файлууд хамт зөөгдөнө", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("chapter/body.tex", "бие");
  root.put("chapter/.notes", "тэмдэглэл");
  root.put("chapter/body.aux", "aux");
  root.put("chapter/.git/HEAD", "ref");
  await openDirHandle(root.asHandle());

  await renamePath("chapter", "renamed");

  assert.equal(root.read("renamed/body.tex"), "бие");
  assert.equal(root.read("renamed/.notes"), "тэмдэглэл");
  assert.equal(root.read("renamed/body.aux"), "aux");
  assert.equal(root.read("renamed/.git/HEAD"), "ref");
  assert.equal(root.children.has("chapter"), false);
});

test("файлын нэр солиход дискэн дээр зөөгдөнө", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "а");
  await openDirHandle(root.asHandle());

  await renamePath("a.tex", "b.tex");

  assert.equal(root.read("b.tex"), "а");
  assert.equal(root.read("a.tex"), null);
});

test("байгаа файлын нэрийг projectHas мэдээлнэ, хавтсыг файлаар солихгүй", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  await openDirHandle(root.asHandle());
  await createDir("figs");

  assert.equal(projectHas("main.tex"), true);
  assert.equal(projectHas("new.tex"), false);
  await assert.rejects(addFile("figs", new Uint8Array(1)));
  assert.equal(projectText("main.tex"), MAIN);
});

test("баталгаажуулсны дараа файлыг солиход хадгалаагүй төлөв арилна", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "хуучин");
  await openDirHandle(root.asHandle());
  setProjectText("a.tex", "засвар");

  await addFile("a.tex", new TextEncoder().encode("шинэ"));

  assert.equal(root.read("a.tex"), "шинэ");
  assert.equal(projectText("a.tex"), "шинэ");
  assert.equal(project()?.dirty.has("a.tex"), false);
});
