import test from "node:test";
import assert from "node:assert/strict";

import { parse, todayText } from "../src/markdown.ts";
import {
  escapeTex,
  previewTex,
  withParatype,
  toBeamer,
  toLatex,
  toLatexBody,
} from "../src/tex/latex.ts";

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

test("албан бичгийн эхний гарчиг голлосон, тод, дугааргүй", () => {
  const src = "# Өргөдөл гаргах нь:\n\nБие.\n\n## Хавсралт\n";
  const tex = toLatex(parse(src), undefined, { letter: true });
  assert.ok(
    tex.includes("{\\centering\\large\\bfseries Өргөдөл гаргах нь:\\par}"),
  );
  assert.ok(!tex.includes("\\section*{Өргөдөл"));
  assert.ok(tex.includes("\\subsection{Хавсралт}"));
  assert.ok(toLatex(parse(src)).includes("\\section{Өргөдөл гаргах нь:}"));
});

test("албан бичигт MNS 5140-ийн захын зай ба доголгүй догол", () => {
  const letter = toLatex(parse("# А\n\nБие.\n"), undefined, { letter: true });
  assert.match(
    letter,
    /\\usepackage\[a4paper,top=2cm,bottom=2cm,left=3cm,right=1\.5cm\]\{geometry\}/,
  );
  assert.match(letter, /\\setlength\{\\parindent\}\{0pt\}/);
  assert.ok(letter.indexOf("{geometry}") < letter.indexOf("\\begin{document}"));
  assert.doesNotMatch(toLatex(parse("# А\n\nБие.\n")), /geometry/);
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

test("зэрэгцүүлэх div догол мөрийн болон мөр хоорондын зайг өөрчлөхгүй", () => {
  assert.equal(
    body("::: {.left}\nНэг\n\nХоёр\n:::\n"),
    "{\\setlength{\\parindent}{0pt}\\raggedright\nНэг\n\nХоёр\\par}",
  );
  assert.equal(
    body("::: {.right}\nНэг\n:::\n"),
    "{\\setlength{\\parindent}{0pt}\\raggedleft\nНэг\\par}",
  );
});

test("\\today LaTeX-д системийн огноогоор бичигдэнэ", () => {
  assert.equal(body("Огноо: \\today"), "Огноо: " + todayText());
});

test("toLatexBody: хуудас таслалт", () => {
  assert.equal(body("А\n\n\\newpage\n\nБ"), "А\n\n\\newpage\n\nБ");
});

test("previewTex хэсгийг бүтэн баримт болгоно", () => {
  const out = previewTex("\\section{А}\nТекст $x$.");
  assert.match(out, /^\\documentclass/);
  assert.match(out, /\\usepackage\{amsmath\}/);
  assert.match(out, /\\begin\{document\}\n\\section\{А\}/);
  assert.match(out, /\\end\{document\}\n$/);
});

test("previewTex бүтэн баримтыг өөрчлөхгүй", () => {
  const doc =
    "\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\begin{document}\nА\n\\end{document}\n";
  assert.equal(previewTex(doc), doc);
});

test("withParatype T1, T2A болон кирилл babel баримтад paratype нэмнэ", () => {
  for (const pre of [
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[T2A]{fontenc}",
    "\\usepackage[mongolian]{babel}",
  ]) {
    const doc =
      "\\documentclass{article}\n" +
      pre +
      "\n\\begin{document}\n\\end{document}";
    assert.equal(
      withParatype(doc),
      doc.replace(
        "\\begin{document}",
        "\\usepackage{paratype}\n\\begin{document}",
      ),
    );
  }
});

test("withParatype фонттой эсвэл латин OT1 баримтад null буцаана", () => {
  const own =
    "\\documentclass{article}\n\\usepackage[T2A]{fontenc}\n\\usepackage{paratype}\n\\begin{document}\n\\end{document}";
  assert.equal(withParatype(own), null);
  const latin =
    "\\documentclass{article}\n\\begin{document}\nA\n\\end{document}";
  assert.equal(withParatype(latin), null);
});

test("previewTex begin{document}-ийг давхардуулахгүй, өмнөх хэсгийг preamble болгоно", () => {
  const out = previewTex(
    "\\usepackage{longtable}\n\\begin{document}\nТекст.\n\\end{document}\n",
  );
  assert.equal(out.match(/\\begin\{document\}/g)?.length, 1);
  assert.equal(out.match(/\\end\{document\}/g)?.length, 1);
  assert.ok(
    out.indexOf("\\usepackage{longtable}") < out.indexOf("\\begin{document}"),
  );
});

test("previewTex preamble-гүй хэсэгт байгаа usepackage-ийг preamble уруу шилжүүлнэ", () => {
  const out = previewTex("\\usepackage{longtable}\n\\section{А}\nТекст.\n");
  const begin = out.indexOf("\\begin{document}");
  assert.ok(out.indexOf("\\usepackage{longtable}") < begin);
  assert.ok(!out.slice(begin).includes("\\usepackage"));
});

test("toLatexBody: дэд жагсаалт шаталсан орчин болно", () => {
  assert.equal(
    body("- Хоол\n  - Цуйван\n- Ундаа\n  1. Цай\n"),
    "\\begin{itemize}\n  \\item Хоол\n  \\begin{itemize}\n    \\item Цуйван\n  \\end{itemize}\n" +
      "  \\item Ундаа\n  \\begin{enumerate}\n    \\item Цай\n  \\end{enumerate}\n\\end{itemize}",
  );
});

test("toLatexBody: [ -ээр эхэлсэн жагсаалтын мөр \\item-ийн параметр болохгүй", () => {
  assert.equal(
    body("- [1] Монгол улсын хууль\n- Иргэний [2]\n"),
    "\\begin{itemize}\n  \\item {}[1] Монгол улсын хууль\n  \\item Иргэний [2]\n\\end{itemize}",
  );
});

test("escapeTex: ₮, грек, математик тэмдэгтийг командаар, zero-width-ийг хасна", () => {
  assert.equal(escapeTex("1500₮"), "1500\\texttugrik{}");
  assert.equal(
    escapeTex("αΩΑο"),
    "\\ensuremath{\\alpha}\\ensuremath{\\Omega}Ao",
  );
  assert.equal(escapeTex("∑ℝ"), "\\ensuremath{\\sum}\\ensuremath{\\mathbb{R}}");
  assert.equal(escapeTex("a​b️"), "ab");
});

test("toLatex: тодорхойгүй Unicode тэмдэгтэд эмхтгэл зогсохгүй, ₮-ийн тодорхойлолт нэмэгдэнэ", () => {
  const tex = toLatex(parse("Үнэ 5₮ 😀 ℝ\n"));
  assert.match(tex, /\\def\\UTFviii@undefined@err/);
  assert.match(tex, /\\DeclareRobustCommand\\texttugrik/);
  assert.match(tex, /\\usepackage\{graphicx\}/);
  assert.match(tex, /\\usepackage\{amssymb\}/);
  assert.doesNotMatch(toLatex(parse("Энгийн.\n")), /texttugrik/);
});

test("toLatex: аюултай холбоосыг \\href болгохгүй", () => {
  const tex = toLatex(parse("[дар](javascript:alert(1)) ба <https://a.mn>\n"));
  assert.doesNotMatch(tex, /javascript/);
  assert.match(tex, /дар/);
  assert.match(tex, /\\url\{https:\/\/a\.mn\}/);
});
