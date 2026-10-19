import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyCaret, tidyTex } from "../src/tex/textidy.ts";

test("tidyTex: орчны доторх мөрийг догол мөрөөр шатлана, document-ийг шатлахгүй", () => {
  const src = [
    "\\documentclass{article}",
    "\\begin{document}",
    "   Эхлэл",
    "\\begin{itemize}",
    "\\item нэг",
    "      \\begin{enumerate}",
    "\\item хоёр",
    "\\end{enumerate}",
    "\t\\end{itemize}",
    "\\end{document}",
    "",
  ].join("\n");
  assert.equal(
    tidyTex(src),
    [
      "\\documentclass{article}",
      "\\begin{document}",
      "Эхлэл",
      "\\begin{itemize}",
      "  \\item нэг",
      "  \\begin{enumerate}",
      "    \\item хоёр",
      "  \\end{enumerate}",
      "\\end{itemize}",
      "\\end{document}",
      "",
    ].join("\n"),
  );
});

test("tidyTex: мөрийн төгсгөлийн зайг арилгаж, олон хоосон мөрийг нэг болгоно", () => {
  assert.equal(tidyTex("\n\nа  \n\n\n  \nб\t\n\n\n"), "а\n\nб\n");
});

test("tidyTex: verbatim, lstlisting, Verbatim-ийн агуулгад хүрэхгүй", () => {
  const src = [
    "\\begin{center}",
    "\\begin{verbatim}  ",
    "  код  ",
    "",
    "",
    "\tтаб",
    "  \\end{verbatim}",
    "\\begin{Verbatim}",
    "   x  ",
    "\\end{Verbatim}",
    "\\end{center}",
    "",
  ].join("\n");
  const out = tidyTex(src).split("\n");
  const lines = src.split("\n");
  assert.deepEqual(out.slice(2, 7), lines.slice(2, 7));
  assert.deepEqual(out.slice(8, 10), lines.slice(8, 10));
  assert.equal(out[1], "  \\begin{verbatim}  ");
  assert.equal(out[7], "  \\begin{Verbatim}");
  assert.equal(out[0], "\\begin{center}");
  assert.equal(out[10], "\\end{center}");
});

test("tidyTex: тайлбар, \\verb, \\\\begin доторх begin-ийг тоолохгүй", () => {
  const src = [
    "\\begin{quote}",
    "% \\begin{itemize}",
    "\\verb|\\begin{x}| a",
    "мөр\\\\begin{y}",
    "\\end{quote}",
    "дараа",
    "",
  ].join("\n");
  assert.equal(
    tidyTex(src),
    [
      "\\begin{quote}",
      "  % \\begin{itemize}",
      "  \\verb|\\begin{x}| a",
      "  мөр\\\\begin{y}",
      "\\end{quote}",
      "дараа",
      "",
    ].join("\n"),
  );
});

test("tidyTex: нэг мөрт нээж хаасан орчин шатлалыг өөрчлөхгүй, илүү end нь сөрөг болохгүй", () => {
  assert.equal(
    tidyTex("\\begin{center}x\\end{center}\nа\n\\end{quote}\nб\n"),
    "\\begin{center}x\\end{center}\nа\n\\end{quote}\nб\n",
  );
});

test("tidyTex: орон зай хадгалдаг тохиргоотой баримтыг өөрчлөхгүй", () => {
  const src = "\\obeyspaces\n\\begin{center}\n   x  \n\\end{center}\n";
  assert.equal(tidyTex(src), src);
});

test("tidyTex: хоёр дахь удаад өөрчлөгдөхгүй", () => {
  const src =
    "\\begin{itemize}\n \\item а  \n\n\n\\begin{verbatim}\n z \n\\end{verbatim}\n\\end{itemize}";
  const once = tidyTex(src);
  assert.equal(tidyTex(once), once);
});

test("tidyCaret: зай биш тэмдэгтүүдээр каретын байрлалыг шилжүүлнэ", () => {
  const before = "\\begin{quote}\nабв  \n\n\nгд\n\\end{quote}\n";
  const after = tidyTex(before);
  const caret = before.indexOf("д");
  assert.equal(after[tidyCaret(before, after, caret)], "д");
  assert.equal(tidyCaret(before, after, 0), 0);
  const word = "\\begin{quote}\n   гд\n\\end{quote}\n";
  const tidyWord = tidyTex(word);
  const at = tidyCaret(word, tidyWord, word.indexOf("г"));
  assert.equal(tidyWord[at], "г");
  const end = before.indexOf("в") + 1;
  assert.equal(
    after
      .slice(0, tidyCaret(before, after, end))
      .trimStart()
      .at(-1),
    "в",
  );
});

test("tidyTex: үл мэдэгдэх орчны доторх мөрүүдэд хүрэхгүй", () => {
  const src = [
    "\\begin{itemize}",
    "\\item а",
    "\\begin{solution}  ",
    "   хариу  ",
    "",
    "",
    "\\begin{solution}",
    "дотор",
    "\\end{solution}",
    "\\end{solution}",
    "\\end{itemize}",
    "",
  ].join("\n");
  const out = tidyTex(src).split("\n");
  const lines = src.split("\n");
  assert.equal(out[1], "  \\item а");
  assert.equal(out[2], "  \\begin{solution}  ");
  assert.deepEqual(out.slice(3, 10), lines.slice(3, 10));
  assert.equal(out[10], "\\end{itemize}");
});

test("tidyTex: баримтад тодорхойлсон орчныг шатална", () => {
  const src = "\\newtheorem{lemma}{Лемм}\n\\begin{lemma}\nа\n\\end{lemma}\n";
  assert.equal(
    tidyTex(src),
    "\\newtheorem{lemma}{Лемм}\n\\begin{lemma}\n  а\n\\end{lemma}\n",
  );
});

test("tidyTex: тасархайгүй зай болон бусад Unicode зайд хүрэхгүй", () => {
  const src =
    "\\begin{center}\n\u00a0а\u00a0\n\u3000б\n\u00a0\n\\end{center}\n";
  assert.equal(
    tidyTex(src),
    "\\begin{center}\n  \u00a0а\u00a0\n  \u3000б\n  \u00a0\n\\end{center}\n",
  );
  assert.equal(
    tidyTex("\\begin\u00a0{center}\nа\n"),
    "\\begin\u00a0{center}\nа\n",
  );
});
