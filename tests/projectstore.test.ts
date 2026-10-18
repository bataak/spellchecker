import assert from "node:assert/strict";
import { test } from "node:test";

import { FakeDir } from "./helpers/fake-fs.ts";
import { openDirHandle, renamePath } from "../src/projectstore.ts";

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
