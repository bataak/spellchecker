import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteEdit, undoQuote } from "../src/tex/texquotes.ts";

const apply = (text: string, typed: string): string => {
  const edit = quoteEdit(text, text.length, typed);
  if (!edit) return text;
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
};

test("quoteEdit: ЬЬ-г « , ВВ-г » болгож шууд хөрвүүлнэ", () => {
  assert.equal(apply("ЬЬ", "Ь"), "«");
  assert.equal(apply("Тэр ЬЬ", "Ь"), "Тэр «");
  assert.equal(apply("үгВВ", "В"), "үг»");
  assert.equal(apply("үг ВВ", "В"), "үг »");
  assert.equal(apply("\\textbf{ЬЬ", "Ь"), "\\textbf{«");
});

test("quoteEdit: жижиг үсэг болон холимог үсгийг ч хөрвүүлнэ", () => {
  assert.equal(apply("ьь", "ь"), "«");
  assert.equal(apply("үгвв", "в"), "үг»");
  assert.equal(apply("Ьь", "ь"), "«");
});

test("quoteEdit: ганц үсэг эсвэл гурав дахь ижил үсэгт хөрвүүлэхгүй", () => {
  assert.equal(apply("Ь", "Ь"), "Ь");
  assert.equal(apply("ЬЬЬ", "Ь"), "ЬЬЬ");
  assert.equal(apply("аВ", "В"), "аВ");
  assert.equal(apply("ВВ", "а"), "ВВ");
});

test("quoteEdit: шинэ каретыг хашилтын араас байрлуулна", () => {
  assert.deepEqual(quoteEdit("а ЬЬ", 4, "Ь"), {
    from: 2,
    to: 4,
    insert: "«",
    caret: 3,
    original: "ЬЬ",
  });
  assert.deepEqual(quoteEdit("үгвв", 4, "в"), {
    from: 2,
    to: 4,
    insert: "»",
    caret: 3,
    original: "вв",
  });
});

test("undoQuote: хөрвүүлсний дараах Backspace анхны үсгийг сэргээнэ", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  const undo = undoQuote("а «", 3, open)!;
  assert.equal("а «".slice(0, undo.from) + undo.insert, "а ЬЬ");
  assert.equal(undo.caret, 4);
  const close = quoteEdit("үгвв", 4, "в")!;
  const back = undoQuote("үг»", 3, close)!;
  assert.equal("үг»".slice(0, back.from) + back.insert, "үгвв");
  assert.equal(back.caret, 4);
});

test("undoQuote: карет эсвэл тэмдэгт өөрчлөгдсөн бол буцаахгүй", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  assert.equal(undoQuote("а «", 2, open), null);
  assert.equal(undoQuote("а х", 3, open), null);
});
