import { test } from "node:test";
import assert from "node:assert/strict";
import { spansInRange, texSpans } from "../src/texhighlight.ts";
import type { TexKind } from "../src/texhighlight.ts";

function pieces(text: string): [TexKind, string][] {
  return texSpans(text).map((s) => [s.kind, text.slice(s.start, s.end)]);
}

test("команд, хаалт, тайлбарыг ялгана", () => {
  assert.deepEqual(pieces("\\textbf{Сайн} % тэмдэглэл\nүг"), [
    ["cmd", "\\textbf"],
    ["delim", "{"],
    ["delim", "}"],
    ["comment", "% тэмдэглэл"],
  ]);
});

test("escape хийсэн тэмдэгт тайлбар, томьёо эхлүүлэхгүй", () => {
  assert.deepEqual(pieces("100\\% ба \\$5"), [
    ["cmd", "\\%"],
    ["cmd", "\\$"],
  ]);
});

test("begin/end-ийн орчны нэрийг ялгана", () => {
  assert.deepEqual(pieces("\\begin{itemize}\\end{itemize}"), [
    ["cmd", "\\begin"],
    ["delim", "{"],
    ["env", "itemize"],
    ["delim", "}"],
    ["cmd", "\\end"],
    ["delim", "{"],
    ["env", "itemize"],
    ["delim", "}"],
  ]);
});

test("мөр доторх болон тусдаа мөрийн томьёо", () => {
  assert.deepEqual(pieces("a $x+1$ b $$y$$ \\(z\\) \\[w\\]"), [
    ["delim", "$"],
    ["math", "x+1"],
    ["delim", "$"],
    ["delim", "$$"],
    ["math", "y"],
    ["delim", "$$"],
    ["delim", "\\("],
    ["math", "z"],
    ["delim", "\\)"],
    ["delim", "\\["],
    ["math", "w"],
    ["delim", "\\]"],
  ]);
});

test("томьёон доторх командыг тусад нь ялгана", () => {
  assert.deepEqual(pieces("$\\alpha^2$"), [
    ["delim", "$"],
    ["cmd", "\\alpha"],
    ["math", "^2"],
    ["delim", "$"],
  ]);
});

test("томьёоны орчин олон мөр дамжина", () => {
  const kinds = pieces("\\begin{align}\na &= b\n\\end{align}\nтекст");
  assert.ok(kinds.some(([k, t]) => k === "math" && t.includes("a ")));
  assert.equal(kinds.at(-1)![0], "delim");
});

test("хаагаагүй $ хоосон мөрөөр тасарна", () => {
  const text = "$x\n\nтекст";
  const last = texSpans(text).at(-1)!;
  assert.ok(last.end <= text.indexOf("текст"));
});

test("verbatim болон \\verb доторх текстийг задлахгүй", () => {
  assert.deepEqual(pieces("\\verb|\\x $|"), [
    ["cmd", "\\verb"],
    ["delim", "|"],
    ["verb", "\\x $"],
    ["delim", "|"],
  ]);
  const env = pieces("\\begin{verbatim}\n\\a $b\n\\end{verbatim}");
  assert.deepEqual(env[4], ["verb", "\n\\a $b\n"]);
  assert.equal(env[5]![1], "\\end");
});

test("одтой команд", () => {
  assert.deepEqual(pieces("\\section*{А}"), [
    ["cmd", "\\section*"],
    ["delim", "{"],
    ["delim", "}"],
  ]);
});

test("мужууд давхцахгүй, эрэмбэтэй", () => {
  const text =
    "\\documentclass{article}\n% x\n\\begin{document}\n$a$ & $$b$$ \\verb|c| \\begin{equation}d\\end{equation}\n\\end{document}";
  const spans = texSpans(text);
  for (let i = 1; i < spans.length; i++)
    assert.ok(spans[i - 1]!.end <= spans[i]!.start);
});

test("spansInRange зөвхөн огтлолцохыг буцаана", () => {
  const spans = texSpans("\\a b \\c d \\e");
  assert.deepEqual(
    spansInRange(spans, 3, 8).map((s) => s.start),
    [5],
  );
  assert.deepEqual(
    spansInRange(spans, 0, 1).map((s) => s.start),
    [0],
  );
});
