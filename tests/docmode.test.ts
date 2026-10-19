import { test } from "node:test";
import assert from "node:assert/strict";
import { createDocMode } from "../src/docmode.ts";

const setup = () => {
  const state = { office: false, name: null as string | null };
  const mode = createDocMode({
    officeActive: () => state.office,
    fileName: () => state.name,
  });
  return { state, mode };
};

const TEX = "\\documentclass{article}\n\\begin{document}\nA\n\\end{document}";

test("docmode бичвэрээс LaTeX-ийг таньна", () => {
  const { mode } = setup();
  mode.setTemplate("plain");
  assert.equal(mode.isLatex(TEX), true);
  assert.equal(mode.isLatex("Энгийн бичвэр"), false);
});

test("docmode article загварт үргэлж LaTeX гэж үзнэ", () => {
  const { mode } = setup();
  mode.setTemplate("article");
  assert.equal(mode.isLatex(""), true);
});

test("docmode файлын нэр бичвэрээс давуу", () => {
  const { state, mode } = setup();
  mode.setTemplate("article");
  state.name = "notes.md";
  assert.equal(mode.isLatex(TEX), false);
  state.name = "main.TEX";
  assert.equal(mode.isLatex(""), true);
});

test("docmode төсөл LaTeX, Word файл LaTeX биш", () => {
  const { state, mode } = setup();
  mode.setTemplate("project");
  state.name = "notes.md";
  assert.equal(mode.isLatex(""), true);
  mode.setTemplate("plain");
  mode.setProjectBound(true);
  assert.equal(mode.isLatex(""), true);
  state.office = true;
  assert.equal(mode.isLatex(TEX), false);
});

test("docmode үсгийн цэвэрлэгээг энгийн бичвэрт л идэвхжүүлнэ", () => {
  const { mode } = setup();
  mode.setTemplate("plain");
  assert.equal(mode.checksLetters(), true);
  mode.setTemplate("plain2");
  assert.equal(mode.checksLetters(), true);
  mode.setTemplate("report");
  assert.equal(mode.checksLetters(), false);
});
