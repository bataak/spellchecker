import { test } from "node:test";
import assert from "node:assert/strict";
import {
  insertCode,
  menuEdit,
  openEnvironment,
  type Insert,
} from "../src/tex/texmenuedit.ts";

function run(marked: string, insert: Insert): string | null {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  const caret = marked.indexOf("|");
  const plain = marked.replace(/[[\]|]/g, "");
  const from = start >= 0 ? start : caret;
  const to = start >= 0 ? end : caret;
  const edit = menuEdit(plain, from, to, insert);
  if (!edit) return null;
  const out = plain.slice(0, edit.from) + edit.text + plain.slice(edit.to);
  return out.slice(0, edit.caret) + "|" + out.slice(edit.caret);
}

const cmd = (snippet: string): Insert => ({ kind: "cmd", snippet });
const env = (snippet: string): Insert => ({ kind: "env", snippet });
const text = (snippet: string): Insert => ({ kind: "text", snippet });

test("menuEdit командыг курсорт оруулж, сонголтыг ороож авна", () => {
  assert.equal(run("Үг |", cmd("textbf{#}")), "Үг \\textbf{|}");
  assert.equal(run("Үг [тод] үг", cmd("textbf{#}")), "Үг \\textbf{тод|} үг");
  assert.equal(run("[a]", cmd("frac{#}{}")), "\\frac{a|}{}");
  assert.equal(run("[x+1]", text("$#$")), "$x+1|$");
  assert.equal(run("|", text("\\[\n#\n\\]")), "\\[\n|\n\\]");
});

test("menuEdit аргументгүй командын ард үсэг байвал зай авна", () => {
  assert.equal(run("$|x$", cmd("alpha")), "$\\alpha |x$");
  assert.equal(run("$|+1$", cmd("alpha")), "$\\alpha|+1$");
  assert.equal(run("$[y]$", cmd("mathbb{R}")), "$\\mathbb{R}|$");
});

test("menuEdit Tab-аар гарах хаалтуудыг тэмдэглэнэ", () => {
  const frac = menuEdit("", 0, 0, cmd("frac{#}{}"))!;
  assert.deepEqual(frac.closes, [6, 8]);
  const inline = menuEdit("x", 0, 1, text("$#$"))!;
  assert.deepEqual(inline.closes, [2]);
});

test("menuEdit орчныг мөрийн догол мөрөөр нээж, сонголтыг дотор нь хийнэ", () => {
  assert.equal(
    run("  |", env("itemize")),
    "  \\begin{itemize}\n    |\n  \\end{itemize}",
  );
  assert.equal(
    run("Үг |", env("center")),
    "Үг \n\\begin{center}\n  |\n\\end{center}",
  );
  assert.equal(
    run("[a & b]", env("tabular{#}")),
    "\\begin{tabular}{|}\n  a & b\n\\end{tabular}",
  );
  const table = menuEdit("", 0, 0, env("tabular{#}"))!;
  assert.equal(table.body, "\\begin{tabular}{}\n  ".length);
  assert.equal(
    run("|", env("figure[ht]")),
    "\\begin{figure}[ht]\n  |\n\\end{figure}",
  );
});

test("menuEdit хамгийн дотор нээлттэй орчныг хаана", () => {
  const close: Insert = { kind: "close" };
  assert.equal(
    run("\\begin{a}\n  \\begin{b}\n  x\n  \\end{b}\n  |", close),
    "\\begin{a}\n  \\begin{b}\n  x\n  \\end{b}\n\\end{a}|",
  );
  assert.equal(
    run("  \\begin{itemize}\n  \\item x|", close),
    "  \\begin{itemize}\n  \\item x\n  \\end{itemize}|",
  );
  assert.equal(run("\\begin{a}\\end{a}|", close), null);
  assert.equal(openEnvironment("\\begin{a} % \\begin{b}"), "a");
  assert.equal(
    run("\\begin{a}\n\\begin{b}\n|\n\\end{b}", close),
    "\\begin{a}\n\\begin{b}\n\\end{a}|\n\\end{b}",
  );
  assert.equal(
    openEnvironment("\\begin{a}\\begin{b}", "\\begin{c}\\end{c}\\end{b}"),
    "a",
  );
  assert.equal(run("\\begin{a}|\\end{a}", close), null);
});

test("insertCode цэсэнд харагдах товч кодыг өгнө", () => {
  assert.equal(insertCode(cmd("textbf{#}")), "\\textbf");
  assert.equal(insertCode(cmd("sum_{#}^{}")), "\\sum");
  assert.equal(insertCode(cmd("item ")), "\\item");
  assert.equal(insertCode(env("figure[ht]")), "figure");
  assert.equal(insertCode(env("equation*")), "equation*");
  assert.equal(insertCode(text("^{#}")), "^{…}");
  assert.equal(insertCode(text("\\[\n#\n\\]")), "\\[ … \\]");
  assert.equal(insertCode({ kind: "close" }), "\\end{…}");
});
