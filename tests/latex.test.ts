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
    "\\textbf{тод} \\emph{налуу} зураас \\texttt{код}",
  );
});

test("томьёо", () => {
  assert.equal(
    body("Талбай $S = \\pi r^2$ байна.\n\n$$\n\\frac{a}{b}\n$$"),
    "Талбай $S = \\pi r^2$ байна.\n\n\\[\n\\frac{a}{b}\n\\]",
  );
});

test("томьёоны орчныг \\[ \\]-д давхар ороохгүй", () => {
  const align = "\\begin{align}\na &= b\n\\end{align}";
  assert.equal(body("$$\n" + align + "\n$$"), align);
  assert.equal(body(align), align);
  assert.equal(
    body("$$\n\\begin{aligned}\na\n\\end{aligned}\n$$"),
    "\\[\n\\begin{aligned}\na\n\\end{aligned}\n\\]",
  );
  assert.equal(body("\\[ x = 1 \\]"), "\\[\nx = 1\n\\]");
});

test("томьёоны дотоод орчныг \\[ \\]-д ороож, бичвэрийн орчныг шууд гаргана", () => {
  assert.equal(
    body("\\begin{pmatrix}\n1\n\\end{pmatrix}"),
    "\\[\n\\begin{pmatrix}\n1\n\\end{pmatrix}\n\\]",
  );
  const theorem = "\\begin{theorem}\nАгуулга $x$.\n\\end{theorem}";
  assert.equal(body(theorem), theorem);
});

test("томьёоны хязгаарлагчийг хадгална", () => {
  assert.equal(
    body("$a$ \\(b\\) \\begin{math}c\\end{math} $$d$$"),
    "$a$ \\(b\\) \\begin{math}c\\end{math} $$d$$",
  );
  const env = "\\begin{displaymath}\nx\n\\end{displaymath}";
  assert.equal(body(env), env);
});

test("бөглөх зураас", () => {
  assert.equal(
    body("Нэр ______ /Б.Бат/"),
    "Нэр \\rule[-0.3ex]{3em}{0.4pt} /Б.Бат/",
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

test("хүснэгт booktabs хэв маягтай", () => {
  assert.equal(
    body("| Нэр | Тоо |\n| :-- | --: |\n| ном | 3 |"),
    [
      "\\par\\addvspace{\\medskipamount}",
      "{\\centering\\small",
      "\\begin{tabular}{lr}",
      "\\toprule",
      "\\textbf{Нэр} & \\textbf{Тоо} \\\\",
      "\\midrule",
      "ном & 3 \\\\",
      "\\bottomrule",
      "\\end{tabular}\\par}",
      "\\addvspace{\\medskipamount}",
    ].join("\n"),
  );
});

test("толгойгүй хүснэгт зураасгүй", () => {
  const out = body("| | |\n| - | - |\n| А | Б |");
  assert.ok(!out.includes("rule"));
  assert.ok(out.includes("А & Б \\\\"));
});

test("өргөн хүснэгт хуудсанд багтахаар p{} баганатай", () => {
  const long = "урт ".repeat(30).trim();
  const out = body("| А | Б |\n| - | --: |\n| " + long + " | " + long + " |");
  assert.match(
    out,
    /\\begin\{tabular\}\{>\{\\raggedright\\arraybackslash\}p\{[\d.]+cm\}>\{\\raggedleft\\arraybackslash\}p\{[\d.]+cm\}\}/,
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

test("хуудасны дугааргүй сонголт", () => {
  assert.ok(!toLatex(parse("# А\n")).includes("\\pagestyle{empty}"));
  assert.ok(
    toLatex(parse("# А\n"), undefined, { pageNumbers: false }).includes(
      "\\begin{document}\n\n\\pagestyle{empty}",
    ),
  );
});

test("гарчгийн жагсаалт сонголтоор", () => {
  assert.ok(!toLatex(parse("# А\n")).includes("\\tableofcontents"));
  assert.ok(
    toLatex(parse("# А\n"), undefined, { toc: true }).includes(
      "\\begin{document}\n\n\\tableofcontents",
    ),
  );
});

test("гарын үсгийн хүснэгтийн зураас баганын хамгийн урт утгын өргөнтэй", () => {
  const out = body(
    "::: {.signature}\n| | |\n| --: | :-- |\n| Гаргасан: | С. Боролдой |\n| Гарын үсэг: | ____ |\n:::\n",
  );
  assert.equal(
    out,
    [
      "\\bigskip",
      "\\begin{flushright}",
      "\\renewcommand{\\arraystretch}{1.5}",
      "\\begin{tabular}{rl}",
      "Гаргасан: & С. Боролдой \\\\",
      "Гарын үсэг: & \\hrulefill \\\\",
      "\\end{tabular}",
      "\\end{flushright}",
    ].join("\n"),
  );
});

test("TeX лого: текст дотор лого, томьёо дотор \\text болно", () => {
  const tex = toLatex(
    parse("\\LaTeX2e, \\TeX ба \\LaTeXe.\n\n«$\\LaTeX 2e$»\n"),
  );
  assert.ok(tex.includes("\\LaTeX{}2e, \\TeX{} ба \\LaTeXe{}."), tex);
  assert.ok(tex.includes("$\\text{\\LaTeX} 2e$"), tex);
  assert.ok(!tex.includes("\\textbackslash{}LaTeX"), tex);
});

test("преамбулд зөвхөн хэрэгтэй багцууд орно", () => {
  const plain = toLatex(parse("# А\n\nҮнэ \\$5\n"));
  for (const name of [
    "amsmath",
    "amssymb",
    "array",
    "booktabs",
    "eulervm",
    "amsthm",
    "hyperref",
    "newtheorem",
    "secnumdepth",
    "contentsname",
  ])
    assert.ok(!plain.includes(name), name);
  const full = toLatex(
    parse(
      "[а](http://x)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$x$\n\n\\begin{definition}\nт\n\\end{definition}\n",
    ),
    undefined,
    { toc: true },
  );
  for (const line of [
    "\\usepackage{amsmath}",
    "\\usepackage{booktabs}",
    "\\usepackage{hyperref}",
    "\\usepackage{amsthm}",
    "\\theoremstyle{definition}",
    "\\newtheorem{definition}{Тодорхойлолт}",
  ])
    assert.ok(full.includes(line), line);
  assert.ok(!full.includes("\\newtheorem{theorem}"));
  assert.ok(!full.includes("contentsname"));
});
