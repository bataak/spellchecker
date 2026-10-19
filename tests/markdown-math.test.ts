import test from "node:test";
import assert from "node:assert/strict";

import { format, parse, toHtml } from "../src/markdown.ts";

test("томьёо: мөр доторх ба тусдаа", () => {
  assert.deepEqual(parse("Томьёо $x^2 + \\frac{a}{b}$ байна."), [
    {
      type: "paragraph",
      children: [
        { type: "text", value: "Томьёо " },
        { type: "math", open: "$", value: "x^2 + \\frac{a}{b}" },
        { type: "text", value: " байна." },
      ],
      line: 0,
    },
  ]);
  assert.deepEqual(parse("$$\nE = mc^2\n$$"), [
    { type: "math", fence: "$$", value: "E = mc^2", line: 0 },
  ]);
});

test("томьёо: мөнгөн тэмдэгт томьёо болохгүй", () => {
  assert.deepEqual(parse("Үнэ 100$ ба 200$ болно."), [
    {
      type: "paragraph",
      children: [{ type: "text", value: "Үнэ 100$ ба 200$ болно." }],
      line: 0,
    },
  ]);
});

test("томьёо: буцааж бичихэд хэвээр үлдэнэ", () => {
  const src = "Тэгшитгэл $a_1 + b_1$ ба \\$5.\n\n$$\n\\sum_{i=1}^n i\n$$\n";
  assert.equal(format(format(src)), format(src));
  assert.match(format(src), /\$a_1 \+ b_1\$/);
  assert.match(toHtml(parse(src)), /<div class="math math-display"/);
});

test("томьёо: \\[ \\] ба орчин", () => {
  assert.deepEqual(
    parse("Өмнө\n\\[ x^2 \\]\nДараа").map((b) => b.type),
    ["paragraph", "math", "paragraph"],
  );
  const env = "\\begin{align*}\na &= b \\\\\nc &= d\n\\end{align*}";
  assert.deepEqual(parse(env + "\n\nДогол."), [
    { type: "math", fence: "env", value: env, line: 0 },
    {
      type: "paragraph",
      children: [{ type: "text", value: "Догол." }],
      line: 5,
    },
  ]);
  assert.equal(format("\\[\nx\n\\]\n"), "\\[\nx\n\\]\n");
  assert.equal(format(env + "\n"), env + "\n");
});

test("томьёо: хаагдаагүй бол энгийн догол болно", () => {
  assert.deepEqual(
    parse("\\[1\\] ном зүй\n\nДогол.\n\nСүүл \\]").map((b) => b.type),
    ["paragraph", "paragraph", "paragraph"],
  );
  assert.deepEqual(
    parse("$$ хаагдаагүй\n\nДогол.").map((b) => b.type),
    ["paragraph", "paragraph"],
  );
});

test("LaTeX орчин: томьёоны ба бичвэрийн", () => {
  const types = (src: string): string[] =>
    parse(src).map((b) => (b.type === "latex" ? "latex:" + b.env : b.type));
  assert.deepEqual(types("\\begin{pmatrix}\n1 & 2\n\\end{pmatrix}"), ["math"]);
  assert.deepEqual(types("\\begin{cases}\n1 & x\n\\end{cases}"), ["math"]);
  assert.deepEqual(
    types(
      "\\begin{itemize}\n\\item А\n\\begin{itemize}\n\\item Б\n\\end{itemize}\n\\end{itemize}\n\nДогол.",
    ),
    ["latex:itemize", "paragraph"],
  );
  assert.deepEqual(types("\\begin{proof}\nНэг.\n\nХоёр.\n\\end{proof}"), [
    "latex:proof",
  ]);
  assert.deepEqual(
    types("\\begin{verbatim}\n\\begin{itemize}\n\\end{verbatim}\nДогол."),
    ["latex:verbatim", "paragraph"],
  );
  assert.deepEqual(types("\\begin{unknown}\nх\n\\end{unknown}"), ["paragraph"]);
  assert.deepEqual(types("\\begin{theorem}\nхаагдаагүй"), ["paragraph"]);
});

test("LaTeX орчин буцааж бичихэд хэвээр үлдэнэ", () => {
  const src = "\\begin{table}[h]\n\\centering\n\\caption{Х}\n\\end{table}\n";
  assert.equal(format(src), src);
});

test("томьёо: мөр доторх бүх хязгаарлагч", () => {
  const src = "$a$ \\(b\\) \\begin{math}c\\end{math} $$d$$ төгсгөл.";
  const [p] = parse(src);
  assert.ok(p && p.type === "paragraph");
  assert.deepEqual(
    p.children
      .filter((n) => n.type === "math")
      .map((n) => (n.type === "math" ? [n.open, n.value] : [])),
    [
      ["$", "a"],
      ["\\(", "b"],
      ["\\begin{math}", "c"],
      ["$$", "d"],
    ],
  );
  assert.equal(format(src), src + "\n");
  assert.match(toHtml(parse(src)), /<span class="math math-display">d</);
});

test("томьёо: displaymath орчин", () => {
  const env = "\\begin{displaymath}\nE = mc^2\n\\end{displaymath}";
  assert.deepEqual(parse(env), [
    { type: "math", fence: "env", value: env, line: 0 },
  ]);
});

test("томьёо: код доторх хязгаарлагч хэвээр үлдэнэ", () => {
  assert.deepEqual(parse("`\\(x\\)` ба `$y$`")[0], {
    type: "paragraph",
    children: [
      { type: "code", value: "\\(x\\)" },
      { type: "text", value: " ба " },
      { type: "code", value: "$y$" },
    ],
    line: 0,
  });
});

test("томьёо: escape хийсэн $ хэлбэржүүлэхэд томьёо болохгүй", () => {
  const once = format("\\$5 ба 100$ текст.\n");
  assert.equal(format(once), once);
  const [p] = parse(once);
  assert.ok(p && p.type === "paragraph");
  assert.equal(
    p.children.some((n) => n.type === "math"),
    false,
  );
  assert.equal(format("100$ ба 200$ болно.\n"), "100$ ба 200$ болно.\n");
});

test("хэлбэржүүлэхэд шаардлагагүй escape хийхгүй", () => {
  for (const src of [
    "Захирал ____ Б.Бат",
    "snake_case",
    "2*3 = 6",
    "a * b",
    "[1] ном",
    "100$ ба 200$",
    "a < b > c",
  ])
    assert.equal(format(src), src + "\n");
});

test("утга өөрчлөгдөх тохиолдолд escape хэвээр хийнэ", () => {
  const cases = [
    "\\*тод биш\\*",
    "\\_налуу биш\\_",
    "\\[a\\](b)",
    "\\<https://a.mn\\>",
  ];
  for (const src of cases) {
    const out = format(src);
    assert.equal(
      JSON.stringify(
        parse(out).map((b) => b.type === "paragraph" && b.children),
      ),
      JSON.stringify(
        parse(src).map((b) => b.type === "paragraph" && b.children),
      ),
    );
  }
  const line = format("\\_\\_\\_\\_\n");
  assert.deepEqual(
    parse(line).map((b) => b.type),
    ["paragraph"],
  );
});

test("escape хийсэн тэмдэгт цэг таслал гэж тоологдоно", () => {
  const [p] = parse("\\$~~(а|~~");
  const [q] = parse("$~~(а|~~");
  assert.ok(p && p.type === "paragraph" && q && q.type === "paragraph");
  assert.deepEqual(p.children, [
    { type: "text", value: "$" },
    { type: "del", children: [{ type: "text", value: "(а|" }] },
  ]);
  assert.deepEqual(p.children, q.children);
  assert.equal(format("\\\\(а\\\\)"), "\\\\(а\\\\)\n");
});

test("хоосон томьёо буцааж бичихэд хэвээр үлдэнэ", () => {
  assert.equal(format("$$\n$$\n"), "$$$$\n");
  assert.deepEqual(
    parse("$$$$").map((b) => b.type),
    ["math"],
  );
});
