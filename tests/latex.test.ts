import test from "node:test";
import assert from "node:assert/strict";

import { parse } from "../src/markdown.ts";
import { escapeTex, toBeamer, toLatex, toLatexBody } from "../src/latex.ts";

const body = (md: string): string => toLatexBody(parse(md));

test("escapeTex: тусгай тэмдэгтүүд", () => {
  assert.equal(
    escapeTex("50% & $5 #1 a_b {x} ~ ^ \\"),
    "50\\% \\& \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{} " +
      "\\textasciicircum{} \\textbackslash{}",
  );
});

test("гарчиг ба догол", () => {
  assert.equal(
    body("# Оршил\n\nӨгүүлбэр.\n\n## Үндсэн хэсэг"),
    "\\section{Оршил}\n\nӨгүүлбэр.\n\n\\subsection{Үндсэн хэсэг}",
  );
});

test("бичвэрийн хэлбэр", () => {
  assert.equal(
    body("**тод** *налуу* ~~зураас~~ `код`"),
    "\\textbf{тод} \\emph{налуу} \\sout{зураас} \\texttt{код}",
  );
});

test("холбоос", () => {
  assert.equal(
    body("[сайт](https://a.mn/x%20y#z) <https://b.mn>"),
    "\\href{https://a.mn/x\\%20y\\#z}{сайт} \\url{https://b.mn}",
  );
});

test("жагсаалт", () => {
  assert.equal(
    body("- нэг\n- хоёр"),
    "\\begin{itemize}\n  \\item нэг\n  \\item хоёр\n\\end{itemize}",
  );
  assert.equal(
    body("3. гурав\n4. дөрөв"),
    "\\begin{enumerate}\n\\setcounter{enumi}{2}\n" +
      "  \\item гурав\n  \\item дөрөв\n\\end{enumerate}",
  );
});

test("хүснэгт", () => {
  assert.equal(
    body("| Нэр | Тоо |\n| :-- | --: |\n| ном | 3 |"),
    [
      "\\begin{center}",
      "\\begin{tabular}{|l|r|}",
      "\\hline",
      "Нэр & Тоо \\\\",
      "\\hline",
      "ном & 3 \\\\",
      "\\hline",
      "\\end{tabular}",
      "\\end{center}",
    ].join("\n"),
  );
});

test("ишлэл ба кодын блок", () => {
  assert.equal(body("> ишлэл"), "\\begin{quote}\nишлэл\n\\end{quote}");
  assert.equal(
    body("```\na_b % c\n```"),
    "\\begin{verbatim}\na_b % c\n\\end{verbatim}",
  );
});

test("toLatex: толгой ба баримтын орчин", () => {
  const tex = toLatex(parse("Сайн уу"), "\\documentclass{article}");
  assert.equal(
    tex,
    "\\documentclass{article}\n\n\\begin{document}\n\nСайн уу\n\n\\end{document}\n",
  );
});

test("toBeamer: эхний # гарчгийн слайд, ## бүр шинэ слайд", () => {
  const tex = toBeamer(
    parse("# Нэр\n\n## Нэг\n\n- а\n\n## Хоёр\n\nбичвэр"),
    "\\documentclass{beamer}",
  );
  assert.equal(
    tex,
    [
      "\\documentclass{beamer}\n",
      "\\title{Нэр}\n",
      "\\begin{document}\n",
      "\\begin{frame}\n\\titlepage\n\\end{frame}\n",
      "\\begin{frame}{Нэг}\n\\begin{itemize}\n  \\item а\n\\end{itemize}\n\\end{frame}\n",
      "\\begin{frame}{Хоёр}\nбичвэр\n\\end{frame}\n",
      "\\end{document}\n",
    ].join("\n"),
  );
});

test("toBeamer: --- гарчиггүй слайд, код fragile", () => {
  const tex = toBeamer(parse("---\n\n```\nx\n```"), "");
  assert.ok(tex.includes("\\begin{frame}[fragile]\n\\begin{verbatim}"));
  assert.ok(!tex.includes("\\titlepage"));
});
