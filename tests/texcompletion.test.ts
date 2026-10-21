import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionContext,
  completions,
  expand,
  unchanged,
} from "../src/tex/texcompletion.ts";

function at(marked: string) {
  const caret = marked.indexOf("|");
  return { text: marked.replace("|", ""), caret };
}

function apply(marked: string, label: string): string {
  const { text, caret } = at(marked);
  const ctx = completionContext(text, caret)!;
  const item = completions(ctx).find((c) => c.label === label)!;
  assert.ok(item, label + " олдсонгүй");
  const e = expand(text, caret, ctx, item);
  const out = text.slice(0, e.from) + e.text + text.slice(e.to);
  return out.slice(0, e.caret) + "|" + out.slice(e.caret);
}

test("\\ болон үсгийн дараа командын контекст", () => {
  const { text, caret } = at("Үг \\tex|");
  assert.deepEqual(completionContext(text, caret), {
    kind: "cmd",
    from: 3,
    prefix: "tex",
  });
});

test("ганц \\ эсвэл үгийн дунд контекст гарахгүй", () => {
  for (const s of ["\\|", "\\te|xt", "текст|", "\\\\te|"]) {
    const { text, caret } = at(s);
    assert.equal(completionContext(text, caret), null, s);
  }
});

test("тайлбар дотор санал болгохгүй", () => {
  const { text, caret } = at("% \\sec|");
  assert.equal(completionContext(text, caret), null);
  const escaped = at("100\\% \\sec|");
  assert.equal(completionContext(escaped.text, escaped.caret)?.kind, "cmd");
});

test("\\begin{ дараа орчны контекст", () => {
  const { text, caret } = at("\\begin{ite|");
  assert.deepEqual(completionContext(text, caret), {
    kind: "env",
    from: 7,
    prefix: "ite",
  });
  const empty = at("\\begin{|}");
  assert.equal(completionContext(empty.text, empty.caret)?.prefix, "");
});

test("угтвараар эрэмбэлж, яг таарсныг эхэнд тавина", () => {
  const ctx = completionContext("\\sec", 4)!;
  const labels = completions(ctx).map((c) => c.label);
  assert.equal(labels[0], "section");
  assert.ok(labels.length <= 8);
  assert.ok(labels.every((l) => l.toLowerCase().startsWith("sec")));
});

test("бүрэн бичсэн аргументгүй командад жагсаалт гарахгүй", () => {
  const ctx = completionContext("\\alpha", 6)!;
  assert.deepEqual(completions(ctx), []);
});

test("аргументтай команд курсорыг хаалтад байрлуулна", () => {
  assert.equal(apply("\\textb|", "textbf"), "\\textbf{|}");
  assert.equal(apply("$\\fr|$", "frac"), "$\\frac{|}{}$");
  assert.equal(apply("\\alp|", "alpha"), "\\alpha|");
});

test("орчныг \\end-тэй хамт нээнэ", () => {
  assert.equal(
    apply("\\begin{ite|", "itemize"),
    "\\begin{itemize}\n  |\n\\end{itemize}",
  );
  assert.equal(
    apply("  \\begin{enu|}", "enumerate"),
    "  \\begin{enumerate}\n    |\n  \\end{enumerate}",
  );
});

test("нэмэлт аргументтай орчин", () => {
  assert.equal(
    apply("\\begin{tab|", "tabular"),
    "\\begin{tabular}{|}\n  \n\\end{tabular}",
  );
  assert.equal(
    apply("\\begin{fig|", "figure"),
    "\\begin{figure}[ht]\n  |\n\\end{figure}",
  );
});

test("\\end{ дотор зөвхөн нэрийг гүйцээнэ", () => {
  assert.equal(apply("\\end{ite|", "itemize"), "\\end{itemize}|");
});

test("\\begin командаас орчны жагсаалт уруу шилжинэ", () => {
  const first = apply("\\beg|", "begin");
  assert.equal(first, "\\begin{|}");
  const { text, caret } = at(first);
  assert.equal(completionContext(text, caret)?.kind, "env");
});

test("бүтэн бичсэн команд хэвээр үлдэнэ", () => {
  for (const name of ["in", "par", "pi", "to"]) {
    const { text, caret } = at("$x \\" + name + "|");
    const ctx = completionContext(text, caret)!;
    const first = completions(ctx)[0]!;
    assert.equal(first.label, name);
    assert.ok(unchanged(ctx, first), name);
  }
  const { text, caret } = at("\\para|");
  const ctx = completionContext(text, caret)!;
  assert.ok(!unchanged(ctx, completions(ctx)[0]!));
});
