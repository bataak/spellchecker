import { test } from "node:test";
import assert from "node:assert/strict";
import { isEditOf } from "../src/samedoc.ts";

const THESIS =
  "\\documentclass{article}\n\\usepackage[T2A]{fontenc}\n\\title{Хиймэл оюуны зохиомж}\n" +
  "\\begin{document}\n\\maketitle\n" +
  "Энэхүү бие даалтын ажил нь хувиргагч архитектурын тухай. ".repeat(40) +
  "\n\\end{document}\n";

const PLOT =
  "\\documentclass{article}\n\\usepackage{pgfplots}\n\\begin{document}\n" +
  "\\begin{tikzpicture}\\begin{axis}\\addplot{x^2};\\end{axis}\\end{tikzpicture}\n" +
  "\\end{document}\n";

test("бичих явцын жижиг засварыг ижил баримт гэж үзнэ", () => {
  assert.ok(isEditOf(THESIS, THESIS));
  assert.ok(isEditOf(THESIS.replace("бие даалтын", "бие даалтынх"), THESIS));
  assert.ok(
    isEditOf(
      THESIS.replace(
        "\\usepackage[T2A]{fontenc}",
        "\\usepackage[T2A]{fontenc}\n\\usepackage{amsmath}",
      ),
      THESIS,
    ),
  );
  assert.ok(
    isEditOf(
      THESIS.slice(0, THESIS.length - 300) + "\\end{document}\n",
      THESIS,
    ),
  );
});

test("өөр баримтыг ижил гэж үзэхгүй", () => {
  assert.ok(!isEditOf(PLOT, THESIS));
  assert.ok(!isEditOf(THESIS, PLOT));
  assert.ok(!isEditOf("", THESIS));
});

test("баримтын ихэнхийг сольсон бол шинэ баримт гэж үзнэ", () => {
  const middle = THESIS.indexOf("\\maketitle") + 10;
  const replaced =
    THESIS.slice(0, middle) +
    "x".repeat(THESIS.length - middle - 16) +
    THESIS.slice(-16);
  assert.ok(!isEditOf(replaced, THESIS));
});
