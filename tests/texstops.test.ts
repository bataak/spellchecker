import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionContext,
  completions,
  expand,
} from "../src/tex/texcompletion.ts";
import {
  breakDisplay,
  caretPatch,
  deleteBracket,
  deleteDollar,
  shiftStops,
  snippetStops,
  tabStop,
  typeBracket,
  typeDollar,
} from "../src/tex/texstops.ts";
import type { TabStops } from "../src/tex/texstops.ts";

interface State {
  text: string;
  caret: number;
  stack: TabStops[];
}

function start(marked: string): State {
  const caret = marked.indexOf("|");
  return { text: marked.replace("|", ""), caret, stack: [] };
}

function edit(s: State, text: string, caret: number): State {
  const patch = caretPatch(s.text, text, caret);
  const stack = patch ? shiftStops(s.stack, patch) : s.stack;
  return { text, caret, stack };
}

function complete(s: State, prefix: string, label: string): State {
  const typed = type(s, prefix);
  const ctx = completionContext(typed.text, typed.caret)!;
  const item = completions(ctx).find((c) => c.label === label)!;
  assert.ok(item, label + " олдсонгүй");
  const e = expand(typed.text, typed.caret, ctx, item);
  const stack = shiftStops(typed.stack, {
    from: e.from,
    to: e.to,
    insert: e.text,
  });
  const added = snippetStops(e);
  return {
    text: typed.text.slice(0, e.from) + e.text + typed.text.slice(e.to),
    caret: e.caret,
    stack: added ? [...stack, added] : stack,
  };
}

function type(s: State, chars: string): State {
  return edit(
    s,
    s.text.slice(0, s.caret) + chars + s.text.slice(s.caret),
    s.caret + chars.length,
  );
}

function tab(s: State): State | null {
  const next = tabStop(s.stack, s.text, s.caret);
  if (next.caret === null) return null;
  return { text: s.text, caret: next.caret, stack: next.stack };
}

function show(s: State): string {
  return s.text.slice(0, s.caret) + "|" + s.text.slice(s.caret);
}

test("Tab \\frac-ийн дараагийн хаалт руу, дараа нь гадагш шилжүүлнэ", () => {
  let s = complete(start("$|$"), "\\fr", "frac");
  assert.equal(show(s), "$\\frac{|}{}$");
  s = tab(type(s, "a+b"))!;
  assert.equal(show(s), "$\\frac{a+b}{|}$");
  s = tab(type(s, "c"))!;
  assert.equal(show(s), "$\\frac{a+b}{c}|$");
  assert.equal(tab(s), null);
});

test("хоосон хаалтыг Tab-аар алгасаж болно", () => {
  let s = complete(start("|"), "\\multi", "multicolumn");
  assert.equal(show(s), "\\multicolumn{|}{}{}");
  s = tab(tab(s)!)!;
  assert.equal(show(s), "\\multicolumn{}{}{|}");
  assert.equal(show(tab(s)!), "\\multicolumn{}{}{}|");
});

test("дотор оруулсан командаас гараад гадна талынхыг үргэлжлүүлнэ", () => {
  let s = complete(start("$|$"), "\\fr", "frac");
  s = complete(s, "\\sq", "sqrt");
  assert.equal(show(s), "$\\frac{\\sqrt{|}}{}$");
  s = tab(type(s, "x"))!;
  assert.equal(show(s), "$\\frac{\\sqrt{x}|}{}$");
  s = tab(s)!;
  assert.equal(show(s), "$\\frac{\\sqrt{x}}{|}$");
  s = tab(type(s, "2"))!;
  assert.equal(show(s), "$\\frac{\\sqrt{x}}{2}|$");
});

test("хаалт дотор } бичсэн ч дараагийн хаалтыг алдахгүй", () => {
  let s = complete(start("|"), "\\fr", "frac");
  s = tab(type(s, "\\}"))!;
  assert.equal(show(s), "\\frac{\\}}{|}");
});

test("дөрвөлжин хаалттай аргумент", () => {
  const typed = type(start("|"), "\\usepackage");
  const ctx = completionContext(typed.text, typed.caret)!;
  const item = completions(ctx).find((c) => c.snippet === "usepackage[#]{}")!;
  assert.ok(item);
  const e = expand(typed.text, typed.caret, ctx, item);
  let s: State = { ...edit(typed, e.text, e.caret), stack: [snippetStops(e)!] };
  assert.equal(show(s), "\\usepackage[|]{}");
  s = tab(type(s, "utf8"))!;
  assert.equal(show(s), "\\usepackage[utf8]{|}");
});

test("орчны аргументаас дотор мөр рүү шилжинэ", () => {
  let s = complete(start("\\begin{|"), "tab", "tabular");
  assert.equal(show(s), "\\begin{tabular}{|}\n  \n\\end{tabular}");
  s = tab(type(s, "ll"))!;
  assert.equal(show(s), "\\begin{tabular}{ll}\n  |\n\\end{tabular}");
  assert.equal(tab(s), null);
});

test("\\begin{}-ийн хаалт орчноор солигдоход хуучин зогсоолыг хаяна", () => {
  let s = complete(start("|"), "\\beg", "begin");
  assert.equal(show(s), "\\begin{|}");
  s = complete(s, "ite", "itemize");
  assert.equal(s.stack.length, 0);
  assert.equal(tab(s), null);
});

test("аргументгүй команд зогсоол үүсгэхгүй", () => {
  const s = complete(start("|"), "\\alp", "alpha");
  assert.equal(s.stack.length, 0);
});

test("хаалтыг устгавал зогсоолыг цуцална", () => {
  let s = complete(start("|"), "\\fr", "frac");
  s = edit(s, "\\frac{", 6);
  assert.deepEqual(s.stack, []);
  assert.equal(tab(s), null);
});

test("курсор хэсгээс гарвал Tab хэвийн ажиллана", () => {
  let s = complete(start("x |"), "\\fr", "frac");
  s = { ...s, caret: 0 };
  const next = tabStop(s.stack, s.text, s.caret);
  assert.equal(next.caret, null);
  assert.deepEqual(next.stack, []);
});

test("гаднаас текст өөрчлөгдөж хаалт алга болвол үсрэхгүй", () => {
  const s = complete(start("|"), "\\fr", "frac");
  const swapped = { ...s, text: "\\frac{}xx" };
  assert.equal(tabStop(swapped.stack, swapped.text, 6).caret, null);
});

test("курсорын байрлалаар засварын байрыг зөв тодорхойлно", () => {
  assert.deepEqual(caretPatch("\\frac{}{}", "\\frac{}}{}", 7), {
    from: 6,
    to: 6,
    insert: "}",
  });
  assert.equal(caretPatch("abc", "abc", 1), null);
  assert.deepEqual(caretPatch("aaa", "aa", 1), { from: 1, to: 2, insert: "" });
});

function dollar(s: State): State {
  const plan = typeDollar(s.stack, s.text, s.caret, s.caret);
  if (!plan) return type(s, "$");
  const text = plan.patch
    ? s.text.slice(0, plan.patch.from) +
      plan.patch.insert +
      s.text.slice(plan.patch.to)
    : s.text;
  return { text, caret: plan.caret, stack: plan.stack };
}

function backspace(s: State): State {
  const plan = deleteDollar(s.stack, s.text, s.caret);
  if (!plan)
    return edit(
      s,
      s.text.slice(0, s.caret - 1) + s.text.slice(s.caret),
      s.caret - 1,
    );
  const p = plan.patch!;
  return {
    text: s.text.slice(0, p.from) + p.insert + s.text.slice(p.to),
    caret: plan.caret,
    stack: plan.stack,
  };
}

test("$ бичихэд $|$, дахин бичихэд $$|$$ болно", () => {
  let s = dollar(start("Тэгшитгэл |"));
  assert.equal(show(s), "Тэгшитгэл $|$");
  s = dollar(s);
  assert.equal(show(s), "Тэгшитгэл $$|$$");
});

test("\\$ болон тайлбар дотор хос нэмэхгүй", () => {
  assert.equal(show(dollar(start("Үнэ \\|"))), "Үнэ \\$|");
  assert.equal(show(dollar(start("\\\\|"))), "\\\\$|$");
  assert.equal(show(dollar(start("% тайлбар |"))), "% тайлбар $|");
});

test("хаах $-ийг дахин бичвэл давхарлахгүй, дээгүүр нь гарна", () => {
  let s = type(dollar(start("|")), "x^2");
  s = dollar(s);
  assert.equal(show(s), "$x^2$|");
  s = type(dollar(dollar(start("|"))), "y");
  assert.equal(show(s), "$$y|$$");
  s = dollar(dollar(s));
  assert.equal(show(s), "$$y$$|");
});

test("бусдын бичсэн $-ийн өмнө бичихэд дээгүүр гарахгүй", () => {
  assert.equal(show(dollar(start("|$a$"))), "$|$a$");
  assert.equal(show(dollar(start("|үг"))), "$|үг");
});

test("Tab $...$ дотроос гадагш гаргана", () => {
  const s = tab(type(dollar(start("|")), "a"))!;
  assert.equal(show(s), "$a$|");
  const display = tab(type(dollar(dollar(start("|"))), "b"))!;
  assert.equal(show(display), "$$b$$|");
});

test("хоосон хосыг Backspace нэг дор устгана", () => {
  let s = dollar(dollar(start("|")));
  s = backspace(s);
  assert.equal(show(s), "$|$");
  s = backspace(s);
  assert.equal(show(s), "|");
  const filled = backspace(type(dollar(start("|")), "a"));
  assert.equal(show(filled), "$|$");
  assert.equal(show(backspace(filled)), "|");
});

type Planner = (
  stack: TabStops[],
  text: string,
  from: number,
  to: number,
) => ReturnType<typeof typeDollar>;

function run(s: State, plan: Planner, fallback: string): State {
  const p = plan(s.stack, s.text, s.caret, s.caret);
  if (!p) return type(s, fallback);
  const text = p.patch
    ? s.text.slice(0, p.patch.from) + p.patch.insert + s.text.slice(p.patch.to)
    : s.text;
  return { text, caret: p.caret, stack: p.stack };
}

const enter = (s: State): State => run(s, breakDisplay, "\n");
const bracket = (s: State): State => run(s, typeBracket, "[");

test("хоосон $$|$$ дээр Enter дарвал томьёог тусдаа мөрөнд задална", () => {
  let s = enter(dollar(dollar(start("|"))));
  assert.equal(show(s), "$$\n  |\n$$");
  s = tab(type(s, "E=mc^2"))!;
  assert.equal(show(s), "$$\n  E=mc^2\n$$|");
});

test("доголтой мөрөнд доголыг хадгална", () => {
  const s = enter(dollar(dollar(start("  |"))));
  assert.equal(show(s), "  $$\n    |\n  $$");
});

test("бөглөсөн эсвэл escape хийсэн $$ дээр Enter хэвийн", () => {
  assert.equal(show(enter(start("$$x|$$"))), "$$x\n|$$");
  assert.equal(show(enter(start("\\$$|$$"))), "\\$$\n|$$");
});

test("\\[ бичихэд \\[|\\] болж, Enter-ээр задарна", () => {
  let s = bracket(start("\\|"));
  assert.equal(show(s), "\\[|\\]");
  s = enter(s);
  assert.equal(show(s), "\\[\n  |\n\\]");
  s = tab(type(s, "a"))!;
  assert.equal(show(s), "\\[\n  a\n\\]|");
});

test("\\[ дотор Tab гадагш гаргана", () => {
  const s = tab(type(bracket(start("\\|")), "x"))!;
  assert.equal(show(s), "\\[x\\]|");
});

test("\\\\[ болон энгийн [ хос үүсгэхгүй", () => {
  assert.equal(show(bracket(start("\\\\|"))), "\\\\[|");
  assert.equal(show(bracket(start("a|"))), "a[|");
});

test("хоосон \\[|\\]-ийг Backspace устгана", () => {
  const s = bracket(start("\\|"));
  const p = deleteBracket(s.stack, s.text, s.caret)!;
  assert.deepEqual(p.patch, { from: 1, to: 4, insert: "" });
  assert.equal(p.caret, 1);
});
