import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findSameFile,
  isTexName,
  locateFile,
  saveMessage,
} from "../src/project/linkfiles.ts";
import { failureMessage, ProjectError } from "../src/project/projecterror.ts";

const files = ["main.tex", "ch/intro.tex", "a/b/intro.tex", "img/fig.png"];

test("locateFile ижил агуулгатай файлыг илүүд үзнэ", () => {
  const texts: Record<string, string> = {
    "ch/intro.tex": "A",
    "a/b/intro.tex": "B",
  };
  const textOf = (path: string) => texts[path] ?? null;
  assert.equal(locateFile(files, "intro.tex", "B", textOf), "a/b/intro.tex");
  assert.equal(locateFile(files, "intro.tex", "C", textOf), "ch/intro.tex");
  assert.equal(locateFile(files, "none.tex", "B", textOf), null);
  assert.equal(locateFile(files, "main.tex", "", textOf), "main.tex");
});

test("findSameFile нэр болон нөхцөлөөр хайна", () => {
  assert.equal(
    findSameFile(files, "intro.tex", (path) => path.startsWith("a/")),
    "a/b/intro.tex",
  );
  assert.equal(
    findSameFile(files, "fig.png", () => false),
    undefined,
  );
});

test("isTexName зөвхөн tex, ltx өргөтгөлийг танина", () => {
  assert.equal(isTexName("doc.TEX"), true);
  assert.equal(isTexName("doc.ltx"), true);
  assert.equal(isTexName("doc.md"), false);
  assert.equal(isTexName(null), false);
});

test("saveMessage үр дүн бүрт мессеж өгнө", () => {
  assert.equal(saveMessage("saved"), "Хадгаллаа");
  assert.equal(saveMessage("clean"), "Өөрчлөлт алга");
  assert.equal(saveMessage("downloaded"), "Архивлалаа");
  assert.equal(saveMessage("files"), "Засварласан файлуудыг татлаа");
});

test("failureMessage цуцлалтыг чимээгүй өнгөрөөнө", () => {
  assert.equal(
    failureMessage(new ProjectError("Буруу архив"), "x"),
    "Буруу архив",
  );
  assert.equal(
    failureMessage(new DOMException("stop", "AbortError"), "x"),
    null,
  );
  const error = console.error;
  console.error = () => undefined;
  try {
    assert.equal(failureMessage(new Error("x"), "Алдаа"), "Алдаа");
  } finally {
    console.error = error;
  }
});
