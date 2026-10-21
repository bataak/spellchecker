import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeDir } from "./helpers/fake-fs.ts";
import { createProjectStore } from "../src/project/projectstore.ts";

(globalThis as { window?: unknown }).window ??= globalThis;

const MAIN =
  "\\documentclass{article}\n\\begin{document}\nА\n\\end{document}\n";

test("хавтасны нэр солиход далд болон build файлууд хамт зөөгдөнө", async () => {
  const { openDirHandle, renamePath } = createProjectStore();
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
  const { openDirHandle, renamePath } = createProjectStore();
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "а");
  await openDirHandle(root.asHandle());

  await renamePath("a.tex", "b.tex");

  assert.equal(root.read("b.tex"), "а");
  assert.equal(root.read("a.tex"), null);
});

test("байгаа файлын нэрийг projectHas мэдээлнэ, хавтсыг файлаар солихгүй", async () => {
  const { addFile, createDir, openDirHandle, projectHas, projectText } =
    createProjectStore();
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
  const { addFile, openDirHandle, project, projectText, setProjectText } =
    createProjectStore();
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
  const { addFile, createFile, openDirHandle, project, saveProject } =
    createProjectStore();
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
  const { openDirHandle, project, projectBinary, projectText, renamePath } =
    createProjectStore();
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

test("хадгалаагүй файлыг засах боломжгүй төрөл уруу нэрлэхгүй", async () => {
  const { openDirHandle, projectText, renamePath, setProjectText } =
    createProjectStore();
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "а");
  await openDirHandle(root.asHandle());
  setProjectText("a.tex", "засвар");

  await assert.rejects(renamePath("a.tex", "a.bak"));
  assert.equal(projectText("a.tex"), "засвар");
  assert.equal(root.read("a.tex"), "а");
});

test("хоёр store төлөв болон сонсогчоо хуваалцахгүй", async () => {
  const first = createProjectStore();
  const second = createProjectStore();
  let heard = 0;
  second.onProjectChange(() => heard++);
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  await first.openDirHandle(root.asHandle());
  assert.equal(first.project()?.name, "төсөл");
  assert.equal(second.project(), null);
  assert.equal(second.hasProject(), false);
  assert.equal(heard, 0);
});

test("хадгалаагүй файл дискэн дээр өөрчлөгдвөл мэдэгдэж, засварыг хадгална", async () => {
  const {
    onDiskConflict,
    openDirHandle,
    project,
    projectText,
    refreshProject,
    setProjectText,
  } = createProjectStore();
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "хуучин");
  root.put("b.tex", "б");
  await openDirHandle(root.asHandle());
  const seen: string[][] = [];
  onDiskConflict((paths) => seen.push(paths));

  setProjectText("a.tex", "миний засвар");
  root.put("a.tex", "гаднаас өөрчилсөн текст");
  root.put("b.tex", "өөр б файл");
  assert.equal(await refreshProject(), true);

  assert.deepEqual(seen, [["a.tex"]]);
  assert.equal(projectText("a.tex"), "миний засвар");
  assert.equal(projectText("b.tex"), "өөр б файл");
  assert.ok(project()?.dirty.has("a.tex"));

  assert.equal(await refreshProject(), false);
  assert.deepEqual(seen, [["a.tex"]]);
});

test("засвар дискэн дээрхтэй ижил болсон бол зөрчил гэж үзэхгүй", async () => {
  const { onDiskConflict, openDirHandle, refreshProject, setProjectText } =
    createProjectStore();
  const root = new FakeDir("төсөл");
  root.put("main.tex", MAIN);
  root.put("a.tex", "хуучин");
  await openDirHandle(root.asHandle());
  const seen: string[][] = [];
  onDiskConflict((paths) => seen.push(paths));
  setProjectText("a.tex", "ижилхэн шинэ");
  root.put("a.tex", "ижилхэн шинэ");
  await refreshProject();
  assert.deepEqual(seen, []);
});
