import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeDir } from "./helpers/fake-fs.ts";
import {
  addFile,
  createDir,
  createFile,
  openDirHandle,
  project,
  projectBinary,
  projectHas,
  projectText,
  renamePath,
  saveProject,
  setProjectText,
} from "../src/project/projectstore.ts";

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

test("folder горимд оруулсан шинэ файлыг хадгалахад татна", async (t) => {
  const names: string[] = [];
  const saved = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      set download(name: string) {
        names.push(name);
      },
      click() {},
      remove() {},
    }),
    body: { append() {} },
  };
  t.after(() => {
    (globalThis as { document?: unknown }).document = saved;
  });
  const root = new FakeDir("төсөл", "denied");
  root.put("main.tex", MAIN);
  await openDirHandle(root.asHandle());
  assert.equal(project()?.kind, "folder");

  await addFile("new.tex", new TextEncoder().encode("шинэ"));
  await addFile("fig.png", new Uint8Array([1, 2]));
  await createFile("empty.tex");

  assert.equal(project()?.unsaved, true);
  assert.equal(await saveProject(), "files");
  assert.deepEqual(names.sort(), ["empty.tex", "fig.png", "new.tex"]);
  assert.equal(project()?.unsaved, false);
  assert.equal(await saveProject(), "clean");
});

test("өргөтгөл солиход файлыг засах боломжтой эсэхийг дахин тогтооно", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("chapter.bak", "бүлэг\r\nхоёр");
  root.put("notes.txt", "тэмдэглэл");
  await openDirHandle(root.asHandle());
  assert.equal(projectText("chapter.bak"), null);

  await renamePath("chapter.bak", "chapter.tex");
  assert.equal(projectText("chapter.tex"), "бүлэг\nхоёр");
  assert.equal(project()?.dirty.has("chapter.tex"), false);
  assert.equal(root.read("chapter.tex"), "бүлэг\r\nхоёр");

  await renamePath("notes.txt", "notes.old");
  assert.equal(projectText("notes.old"), null);
  assert.equal(
    new TextDecoder().decode(projectBinary("notes.old")!),
    "тэмдэглэл",
  );
});

test("хадгалаагүй файлыг засах боломжгүй төрөл рүү нэрлэхгүй", async () => {
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "а");
  await openDirHandle(root.asHandle());
  setProjectText("a.tex", "засвар");

  await assert.rejects(renamePath("a.tex", "a.bak"));
  assert.equal(projectText("a.tex"), "засвар");
  assert.equal(root.read("a.tex"), "а");
});
