import { test } from "node:test";
import assert from "node:assert/strict";
import { alignRows } from "../src/tex/texalign.ts";
import { tidyTex } from "../src/tex/textidy.ts";

test("alignRows: хүснэгтийн & тэмдгийг багана болгон тэгшилнэ", () => {
  assert.deepEqual(
    alignRows(
      [
        "\\hline",
        "Нэр&Нас & Хот\\\\ \\hline",
        "Бат-Эрдэнэ & 25&УБ \\\\",
        "Сүх &  & Дархан",
      ],
      "tabular",
    ),
    [
      "\\hline",
      "Нэр        & Нас & Хот \\\\ \\hline",
      "Бат-Эрдэнэ & 25  & УБ \\\\",
      "Сүх        &     & Дархан",
    ],
  );
});

test("alignRows: align дотор &= хэлбэрийг хадгална", () => {
  assert.deepEqual(alignRows(["a &= b+c \\\\", "xyz&\\le 1"], "align"), [
    "a   &= b+c \\\\",
    "xyz &\\le 1",
  ]);
  assert.deepEqual(alignRows(["a &= b \\\\", "c & = d"], "tabular"), [
    "a & = b \\\\",
    "c & = d",
  ]);
});

test("alignRows: хаалт доторх & болон \\\\&-ийг тусгаарлагч гэж үзэхгүй", () => {
  assert.deepEqual(
    alignRows(["\\multicolumn{2}{c}{a & b} & x\\\\", "\\& & y"], "tabular"),
    ["\\multicolumn{2}{c}{a & b} & x \\\\", "\\&                        & y"],
  );
});

test("alignRows: эргэлзээтэй хүснэгтэд хүрэхгүй", () => {
  assert.equal(alignRows(["a & b % тайлбар \\\\", "c & d"], "tabular"), null);
  assert.equal(alignRows(["\\verb|&| & b \\\\", "c & d"], "tabular"), null);
  assert.equal(alignRows(["a & b \\\\ c & d \\\\", "e & f"], "tabular"), null);
  assert.equal(alignRows(["a & b", "c & d"], "tabular"), null);
  assert.equal(alignRows(["a & {b \\\\", "} c & d"], "tabular"), null);
  assert.equal(alignRows(["a & b"], "tabular"), null);
});

test("tidyTex: хүснэгтийг шаталж, баганыг тэгшилнэ", () => {
  const src = [
    "\\begin{table}",
    "\\begin{tabular}{ll}",
    "a&bb\\\\",
    "ccc & d",
    "\\end{tabular}",
    "\\end{table}",
    "",
  ].join("\n");
  assert.equal(
    tidyTex(src),
    [
      "\\begin{table}",
      "  \\begin{tabular}{ll}",
      "    a   & bb \\\\",
      "    ccc & d",
      "  \\end{tabular}",
      "\\end{table}",
      "",
    ].join("\n"),
  );
  assert.equal(tidyTex(tidyTex(src)), tidyTex(src));
});

test("tidyTex: орчин агуулсан эсвэл эхлэл мөрөндөө нүдтэй хүснэгтийг тэгшлэхгүй", () => {
  const nested =
    "\\begin{tabular}{ll}\na&\\begin{tabular}{c}x\\end{tabular}\\\\\nbb&c\n\\end{tabular}\n";
  assert.equal(
    tidyTex(nested),
    nested.replace("\na&", "\n  a&").replace("\nbb", "\n  bb"),
  );
  const inline =
    "\\begin{tabular}{ll} a&b\\\\\ncc&d\\\\\nе&ж\n\\end{tabular}\n";
  assert.equal(
    tidyTex(inline),
    inline.replace("\ncc", "\n  cc").replace("\nе", "\n  е"),
  );
});
