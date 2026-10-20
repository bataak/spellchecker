import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteEdit, undoQuote } from "../src/tex/texquotes.ts";

const apply = (text: string, typed: string): string => {
  const edit = quoteEdit(text, text.length, typed);
  if (!edit) return text;
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
};

test("quoteEdit: ЬЬ-г бичмэгц « болгоно", () => {
  assert.equal(apply("ЬЬ", "Ь"), "«");
  assert.equal(apply("Тэр ьь", "ь"), "Тэр «");
  assert.equal(apply("\\textbf{Ьь", "ь"), "\\textbf{«");
  assert.equal(apply("Ь", "Ь"), "Ь");
  assert.equal(apply("ЬЬЬ", "Ь"), "ЬЬЬ");
});

test("quoteEdit: ВВ-г араас нь зай эсвэл цэг таслал ирэхэд » болгоно", () => {
  assert.equal(apply("үгвв ", " "), "үг» ");
  assert.equal(apply("үгВВ,", ","), "үг»,");
  assert.equal(apply("үгвв.", "."), "үг».");
  assert.equal(apply("үгвв?", "?"), "үг»?");
  assert.equal(apply("{үгвв}", "}"), "{үг»}");
  assert.equal(apply("үгвв\n", "\n"), "үг»\n");
});

test("quoteEdit: ВВ-ийн араас үсэг ирвэл эсвэл ганц В бол хөрвүүлэхгүй", () => {
  assert.equal(apply("үгвв", "в"), "үгвв");
  assert.equal(apply("үгввы", "ы"), "үгввы");
  assert.equal(apply("үгв ", " "), "үгв ");
  assert.equal(apply("үгввв ", " "), "үгввв ");
});

test("quoteEdit: шинэ каретыг солилтын араас байрлуулна", () => {
  assert.deepEqual(quoteEdit("а ЬЬ", 4, "Ь"), {
    from: 2,
    to: 4,
    insert: "«",
    caret: 3,
    original: "ЬЬ",
  });
  assert.deepEqual(quoteEdit("үгвв ", 5, " "), {
    from: 2,
    to: 4,
    insert: "»",
    caret: 4,
    original: "вв",
  });
});

test("undoQuote: хөрвүүлсний дараах Backspace анхны үсгийг сэргээнэ", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  const undo = undoQuote("а «", 3, open)!;
  assert.equal("а «".slice(0, undo.from) + undo.insert, "а ЬЬ");
  assert.equal(undo.caret, 4);
  const close = quoteEdit("үгвв ", 5, " ")!;
  const back = undoQuote("үг» ", 4, close)!;
  assert.equal(
    "үг» ".slice(0, back.from) + back.insert + "үг» ".slice(back.to),
    "үгвв ",
  );
  assert.equal(back.caret, 5);
});

test("undoQuote: карет эсвэл тэмдэгт өөрчлөгдсөн бол буцаахгүй", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  assert.equal(undoQuote("а «", 2, open), null);
  assert.equal(undoQuote("а х", 3, open), null);
});
