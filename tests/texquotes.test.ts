import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteEdit, undoQuote } from "../src/tex/texquotes.ts";

const apply = (text: string, typed: string): string => {
  const edit = quoteEdit(text, text.length, typed);
  if (!edit) return text;
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
};

test("quoteEdit: зай, мөрийн эхлэл эсвэл хаалтын дараах ЬЬ-г « болгоно", () => {
  assert.equal(apply("ЬЬ", "Ь"), "«");
  assert.equal(apply("Тэр ЬЬ", "Ь"), "Тэр «");
  assert.equal(apply("а\nЬЬ", "Ь"), "а\n«");
  assert.equal(apply("\\textbf{ЬЬ", "Ь"), "\\textbf{«");
  assert.equal(apply("(ЬЬ", "Ь"), "(«");
});

test("quoteEdit: үгийн дундах ЬЬ-д хүрэхгүй", () => {
  assert.equal(apply("аЬЬ", "Ь"), "аЬЬ");
  assert.equal(apply("ЬЬЬ", "Ь"), "ЬЬЬ");
  assert.equal(apply("Ь", "Ь"), "Ь");
});

test("quoteEdit: үгийн араас ВВ-г зай эсвэл цэг таслалаар » болгоно", () => {
  assert.equal(apply("«үгВВ ", " "), "«үг» ");
  assert.equal(apply("«үгВВ.", "."), "«үг».");
  assert.equal(apply("«үгВВ,", ","), "«үг»,");
  assert.equal(apply("«үгВВ\n", "\n"), "«үг»\n");
  assert.equal(apply("{«үгВВ}", "}"), "{«үг»}");
  assert.equal(apply("«Яагаад?ВВ ", " "), "«Яагаад?» ");
});

test("quoteEdit: зайн дараах эсвэл үсгийн өмнөх ВВ-д хүрэхгүй", () => {
  assert.equal(apply("үг ВВ ", " "), "үг ВВ ");
  assert.equal(apply("ВВ ", " "), "ВВ ");
  assert.equal(apply("үгВВа", "а"), "үгВВа");
  assert.equal(apply("үгвв ", " "), "үгвв ");
});

test("quoteEdit: шинэ каретыг солисон тэмдэгтийн араас байрлуулна", () => {
  assert.deepEqual(quoteEdit("а ЬЬ", 4, "Ь"), {
    from: 2,
    to: 4,
    insert: "«",
    caret: 3,
    original: "ЬЬ",
  });
  assert.deepEqual(quoteEdit("үгВВ ", 5, " "), {
    from: 2,
    to: 4,
    insert: "»",
    caret: 4,
    original: "ВВ",
  });
});

test("undoQuote: хувиргасны дараах Backspace анхны үсгийг сэргээнэ", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  const undoOpen = undoQuote("а «", 3, open)!;
  assert.equal(
    "а «".slice(0, undoOpen.from) + undoOpen.insert + "а «".slice(undoOpen.to),
    "а ЬЬ",
  );
  assert.equal(undoOpen.caret, 4);
  const close = quoteEdit("үгВВ ", 5, " ")!;
  const undoClose = undoQuote("үг» ", 4, close)!;
  assert.equal(
    "үг» ".slice(0, undoClose.from) +
      undoClose.insert +
      "үг» ".slice(undoClose.to),
    "үгВВ ",
  );
  assert.equal(undoClose.caret, 5);
});

test("undoQuote: карет эсвэл тэмдэгт өөрчлөгдсөн бол буцаахгүй", () => {
  const open = quoteEdit("а ЬЬ", 4, "Ь")!;
  assert.equal(undoQuote("а «", 2, open), null);
  assert.equal(undoQuote("а х", 3, open), null);
});
