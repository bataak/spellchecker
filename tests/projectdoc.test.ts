import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  addBlob,
  addDir,
  addText,
  blobHash,
  blobsOf,
  movePath,
  outputPdf,
  projectOf,
  removePath,
  seedProject,
  setMain,
  sharedPath,
  snapshotOf,
  textOf,
} from "../src/collab/projectdoc.ts";

function pair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update));
  return [a, b];
}

function forked(): [Y.Doc, Y.Doc, () => void] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const merge = (): void => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  return [a, b, merge];
}

test("төслийн snapshot-ийг Y.Doc-д бичиж буцааж уншина", () => {
  const doc = new Y.Doc();
  seedProject(doc, {
    texts: new Map([
      ["main.tex", "\\documentclass{article}"],
      ["ch/one.tex", "Нэг"],
      ["main.aux", "\\relax"],
    ]),
    blobs: new Map([
      ["fig/a.png", { hash: "h1", size: 10 }],
      ["main.pdf", { hash: "h2", size: 99 }],
      ["fig/b.pdf", { hash: "h3", size: 5 }],
    ]),
    dirs: new Set(["ch", "fig", "empty", ".git"]),
    main: "main.tex",
  });
  const snap = projectOf(doc);
  assert.deepEqual(
    new Map([...snap.texts].sort()),
    new Map([
      ["ch/one.tex", "Нэг"],
      ["main.tex", "\\documentclass{article}"],
    ]),
  );
  assert.deepEqual(snap.blobs.get("fig/a.png"), { hash: "h1", size: 10 });
  assert.deepEqual(snap.blobs.get("fig/b.pdf"), { hash: "h3", size: 5 });
  assert.equal(snap.blobs.has("main.pdf"), false);
  assert.deepEqual([...snap.dirs].sort(), ["ch", "empty", "fig"]);
  assert.equal(snap.main, "main.tex");
});

test("үүсгэсэн файл, гаралтын PDF-ийг хуваалцахгүй", () => {
  assert.equal(outputPdf("thesis/main.tex"), "thesis/main.pdf");
  assert.equal(outputPdf(null), null);
  assert.equal(sharedPath("main.log", "main.tex"), false);
  assert.equal(sharedPath("main.synctex.gz", "main.tex"), false);
  assert.equal(sharedPath("main.pdf", "main.tex"), false);
  assert.equal(sharedPath("fig/main.pdf", "main.tex"), true);
  assert.equal(sharedPath("refs.bib", "main.tex"), true);
});

test("хоёр хүний засвар нэг файлд нэгтгэгдэнэ", () => {
  const [a, b, merge] = forked();
  addText(a, "main.tex", "AC");
  merge();
  textOf(a, "main.tex")!.insert(1, "B");
  textOf(b, "main.tex")!.insert(2, "D");
  merge();
  assert.equal(projectOf(a).texts.get("main.tex"), "ABCD");
  assert.equal(projectOf(b).texts.get("main.tex"), "ABCD");
});

test("нэр солих үед зэрэг хийсэн засвар алдагдахгүй", () => {
  const [a, b, merge] = forked();
  addText(a, "ch/one.tex", "Нэг");
  addDir(a, "ch");
  setMain(a, "ch/one.tex");
  merge();
  movePath(a, "ch", "chapters");
  textOf(b, "ch/one.tex")!.insert(3, " хоёр");
  merge();
  for (const doc of [a, b]) {
    const snap = projectOf(doc);
    assert.equal(snap.texts.get("chapters/one.tex"), "Нэг хоёр");
    assert.equal(snap.texts.has("ch/one.tex"), false);
    assert.deepEqual([...snap.dirs], ["chapters"]);
    assert.equal(snap.main, "chapters/one.tex");
  }
});

test("ижил нэртэй файлыг зэрэг үүсгэвэл хоёулаа дугаартай үлдэнэ", () => {
  const [a, b, merge] = forked();
  addText(a, "notes.tex", "a");
  addText(b, "notes.tex", "b");
  merge();
  const left = projectOf(a);
  const right = projectOf(b);
  assert.deepEqual([...left.texts].sort(), [...right.texts].sort());
  assert.deepEqual([...left.texts.keys()].sort(), [
    "notes (2).tex",
    "notes.tex",
  ]);
  assert.deepEqual([...left.texts.values()].sort(), ["a", "b"]);
});

test("хавтас устгахад доторх файл, хавтас, үндсэн файл арилна", () => {
  const [a, b] = pair();
  addText(a, "ch/one.tex", "1");
  addText(a, "ch/sub/two.tex", "2");
  addText(a, "chapter.tex", "3");
  addBlob(a, "ch/fig.png", { hash: "h", size: 1 });
  addDir(a, "ch");
  addDir(a, "ch/sub");
  setMain(a, "ch/one.tex");
  removePath(a, "ch");
  const snap = projectOf(b);
  assert.deepEqual([...snap.texts.keys()], ["chapter.tex"]);
  assert.equal(snap.blobs.size, 0);
  assert.equal(snap.dirs.size, 0);
  assert.equal(snap.main, null);
  assert.equal(textOf(b, "ch/one.tex"), null);
});

test("хоёртын файлыг SHA-256-аар тодорхойлж snapshot үүсгэнэ", async () => {
  assert.equal(
    await blobHash(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const snap = await snapshotOf(
    new Map([["main.tex", "x"]]),
    new Map([
      ["a.png", new Uint8Array([1, 2, 3])],
      ["main.pdf", new Uint8Array([9])],
    ]),
    ["fig"],
    "main.tex",
  );
  assert.equal(snap.blobs.get("a.png")?.size, 3);
  assert.equal(snap.blobs.get("a.png")?.hash.length, 64);
  assert.equal(snap.blobs.has("main.pdf"), false);
  assert.deepEqual([...snap.dirs], ["fig"]);
});

test("projectOf хадгалсан текстийг дотоод ба алсын засвараар шинэчилнэ", () => {
  const [a, b] = pair();
  addText(a, "main.tex", "А");
  addBlob(a, "fig.png", { hash: "h", size: 3 });
  assert.equal(projectOf(b).texts.get("main.tex"), "А");
  textOf(a, "main.tex")!.insert(1, "Б");
  assert.equal(projectOf(b).texts.get("main.tex"), "АБ");
  assert.equal(projectOf(a).texts.get("main.tex"), "АБ");
  textOf(b, "main.tex")!.delete(0, 1);
  assert.equal(projectOf(a).texts.get("main.tex"), "Б");
  removePath(a, "main.tex");
  addText(a, "main.tex", "шинэ");
  assert.equal(projectOf(b).texts.get("main.tex"), "шинэ");
  assert.deepEqual([...blobsOf(b)], [["fig.png", { hash: "h", size: 3 }]]);
});
