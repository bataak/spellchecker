import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionContext,
  completions,
  expand,
} from "../src/texcompletion.ts";
import {
  caretPatch,
  shiftStops,
  snippetStops,
  tabStop,
} from "../src/texstops.ts";
import type { TabStops } from "../src/texstops.ts";

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
