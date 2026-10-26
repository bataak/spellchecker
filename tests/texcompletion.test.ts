import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionContext,
  completions,
  expand,
  unchanged,
} from "../src/tex/texcompletion.ts";
import { COMMANDS, ENVIRONMENTS } from "../src/tex/texcommands.ts";

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

test("\\item-ийг гүйцээхэд ард нь зай авна", () => {
  assert.equal(apply("\\ite|", "item"), "\\item |");
  assert.equal(apply("\\item|", "item"), "\\item |");
});

test("\\index болон индексийн командуудыг санал болгоно", () => {
  assert.equal(apply("Үг\\ind|", "index"), "Үг\\index{|}");
  const ctx = completionContext("\\inde", 5)!;
  const snippets = completions(ctx).map((c) => c.snippet);
  assert.ok(snippets.includes("index{#!}"));
  assert.ok(snippets.includes("index{#|see{}}"));
  assert.equal(apply("\\printin|", "printindex"), "\\printindex|");
  assert.equal(apply("\\makein|", "makeindex"), "\\makeindex|");
});

test("жагсаалтын команд, орчин бүр бичигдэх боломжтой нэртэй", () => {
  const labels = [...COMMANDS, ...ENVIRONMENTS].map(
    (snippet) => /^[A-Za-z]+\*?/.exec(snippet)?.[0] ?? "",
  );
  assert.ok(labels.every(Boolean));
  assert.equal(new Set(COMMANDS).size, COMMANDS.length);
  assert.equal(new Set(ENVIRONMENTS).size, ENVIRONMENTS.length);
});

test("beamer-ийн <> аргументтай командын нэрийг зөв таслана", () => {
  assert.equal(apply("\\onl|", "only"), "\\only<|>{}");
});

const SYMBOLS = {
  label: ["sec:intro", "fig:map", "eq:main"],
  cite: ["knuth84", "lamport94"],
  index: ["мод", "мод!нарс", "өвөл"],
  commands: ["R", "pair{#}{}", "section"],
  environments: ["lemma", "boxed{#}", "itemize"],
};

function applyWith(marked: string, label: string): string {
  const { text, caret } = at(marked);
  const ctx = completionContext(text, caret)!;
  const item = completions(ctx, SYMBOLS).find((c) => c.label === label)!;
  assert.ok(item, label + " олдсонгүй");
  const e = expand(text, caret, ctx, item);
  const out = text.slice(0, e.from) + e.text + text.slice(e.to);
  return out.slice(0, e.caret) + "|" + out.slice(e.caret);
}

const labelsAt = (marked: string): string[] => {
  const { text, caret } = at(marked);
  const ctx = completionContext(text, caret);
  return ctx ? completions(ctx, SYMBOLS).map((c) => c.label) : [];
};

test("\\ref, \\cite, \\index дотор баримтын нэрсийг санал болгоно", () => {
  assert.deepEqual(labelsAt("\\ref{|}"), ["sec:intro", "fig:map", "eq:main"]);
  assert.deepEqual(labelsAt("\\eqref{e|}"), ["eq:main"]);
  assert.deepEqual(labelsAt("\\cite{knuth84,|}"), ["knuth84", "lamport94"]);
  assert.deepEqual(labelsAt("\\index{мо|}"), ["мод", "мод!нарс"]);
  assert.deepEqual(labelsAt("\\index{Ө|}"), ["өвөл"]);
  assert.equal(applyWith("\\ref{fi|}", "fig:map"), "\\ref{fig:map|}");
  assert.equal(
    applyWith("\\citep{knuth84, la|}", "lamport94"),
    "\\citep{knuth84, lamport94|}",
  );
  assert.deepEqual(labelsAt("\\textbf{s|}"), []);
  assert.deepEqual(labelsAt("% \\ref{|}"), []);
});

test("бүрэн бичсэн ганц нэрд жагсаалт гаргахгүй, Enter хэвээр ажиллана", () => {
  assert.deepEqual(labelsAt("\\ref{eq:main|}"), []);
  const { text, caret } = at("\\index{мод|}");
  const ctx = completionContext(text, caret)!;
  const [first] = completions(ctx, SYMBOLS);
  assert.equal(first!.label, "мод");
  assert.ok(unchanged(ctx, first!));
});

test("хэрэглэгчийн команд, орчныг жагсаалтад нэмж, давхардуулахгүй", () => {
  assert.equal(applyWith("$\\pa|$", "pair"), "$\\pair{|}{}$");
  assert.equal(applyWith("\\R|", "R"), "\\R|");
  assert.equal(
    labelsAt("\\sectio|").filter((label) => label === "section").length,
    1,
  );
  assert.equal(
    applyWith("\\begin{lem|", "lemma"),
    "\\begin{lemma}\n  |\n\\end{lemma}",
  );
  assert.equal(
    applyWith("\\begin{box|", "boxed"),
    "\\begin{boxed}{|}\n  \n\\end{boxed}",
  );
  assert.equal(
    labelsAt("\\begin{itemi|").filter((label) => label === "itemize").length,
    1,
  );
});
