import { test } from "node:test";
import assert from "node:assert/strict";
import { toPdfLatex } from "../src/tex/texcompat.ts";

const XELATEX = `\\documentclass{article}
\\usepackage{fontspec}
\\usepackage{polyglossia}
\\setdefaultlanguage{mongolian}
\\setotherlanguage{english}
\\setmainfont{Times New Roman}
\\setsansfont[Scale=0.9]{Arial}
\\newfontfamily\\cyrillicfont[Script=Cyrillic]{Times New Roman}
\\usepackage{amsmath}
\\begin{document}
Сайн байна уу. \\textenglish{Hello}
\\end{document}
`;

test("XeLaTeX-ийн багц, фонт, хэлний тохиргоог pdfLaTeX болгоно", () => {
  const out = toPdfLatex(XELATEX);
  for (const gone of [
    "fontspec",
    "polyglossia",
    "\\setmainfont",
    "\\setsansfont",
    "\\newfontfamily",
    "\\setdefaultlanguage",
    "\\setotherlanguage",
  ])
    assert.ok(!out.includes(gone), gone);
  assert.match(
    out,
    /^\\documentclass\[a4paper\]\{article\}\n\\usepackage\[T2A\]\{fontenc\}/,
  );
  assert.ok(out.includes("\\usepackage{paratype}"));
  assert.ok(out.includes("\\usepackage[english,mongolian]{babel}"));
  assert.ok(out.includes("\\providecommand\\cyrillicfont{}"));
  assert.ok(
    out.includes(
      "\\providecommand{\\textenglish}[1]{\\foreignlanguage{english}{#1}}",
    ),
  );
  assert.ok(out.includes("\\usepackage{amsmath}"));
  assert.ok(
    out.endsWith("Сайн байна уу. \\textenglish{Hello}\n\\end{document}\n"),
  );
});

test("sans үндсэн фонтыг sans болгож үлдээнэ", () => {
  const out = toPdfLatex(
    "\\documentclass{article}\n\\usepackage{fontspec}\n\\setmainfont{Arial}\n\\begin{document}x\\end{document}",
  );
  assert.ok(out.includes("\\renewcommand{\\familydefault}{\\sfdefault}"));
});

test("жагсаалтаас зөвхөн XeTeX-ийн багцыг хасна", () => {
  const out = toPdfLatex(
    "\\documentclass{article}\n\\usepackage[no-math]{amsmath,fontspec,graphicx}\n\\begin{document}x\\end{document}",
  );
  assert.ok(out.includes("\\usepackage[no-math]{amsmath,graphicx}"));
  assert.ok(!out.includes("fontspec"));
});

test("кирилл үсэгтэй баримтад T2A кодчилол нэмнэ", () => {
  const out = toPdfLatex(
    "\\documentclass[12pt]{article}\n\\usepackage{pgfplots}\n\\begin{document}\nөнөөдөр\n\\end{document}\n",
  );
  assert.ok(
    out.startsWith(
      "\\documentclass[a4paper,12pt]{article}\n\\usepackage[T2A]{fontenc}\n\\usepackage{pgfplots}",
    ),
  );
});

test("кирилл тохиргоотой эсвэл латин баримтыг өөрчлөхгүй", () => {
  const ready =
    "\\documentclass[a4paper]{article}\n\\usepackage[T1,T2A]{fontenc}\n\\begin{document}\nөнөөдөр\n\\end{document}\n";
  assert.equal(toPdfLatex(ready), ready);
  const latin =
    "\\documentclass[a4paper]{article}\n\\begin{document}\ntoday\n\\end{document}\n";
  assert.equal(toPdfLatex(latin), latin);
  assert.equal(toPdfLatex("өнөөдөр"), "өнөөдөр");
});

test("гарчиг дахь кирилл үсгийг ч тооцно", () => {
  const out = toPdfLatex(
    "\\documentclass{article}\n\\title{Монгол}\n\\begin{document}\n\\maketitle\n\\end{document}\n",
  );
  assert.ok(out.includes("\\usepackage[T2A]{fontenc}"));
});

const doc = (head: string): string =>
  head + "\n\\begin{document}\ntoday\n\\end{document}\n";

test("цаасны хэмжээ заагаагүй баримтыг A4 болгоно", () => {
  for (const [from, to] of [
    ["\\documentclass{article}", "\\documentclass[a4paper]{article}"],
    ["\\documentclass[]{report}", "\\documentclass[a4paper]{report}"],
    ["\\documentclass[11pt]{book}", "\\documentclass[a4paper,11pt]{book}"],
    [
      "\\documentclass[11pt, % note\n]{amsart}",
      "\\documentclass[a4paper,11pt, % note\n]{amsart}",
    ],
    [
      "% \\documentclass{book}\n\\documentclass{article}",
      "% \\documentclass{book}\n\\documentclass[a4paper]{article}",
    ],
  ])
    assert.equal(toPdfLatex(doc(from)), doc(to));
});

test("цаасны хэмжээ заасан эсвэл өөр классыг өөрчлөхгүй", () => {
  for (const head of [
    "\\documentclass[letterpaper]{article}",
    "\\documentclass[a5paper,12pt]{report}",
    "\\documentclass[paper=a5]{article}",
    "\\documentclass{beamer}",
    "\\documentclass{scrartcl}",
    "\\documentclass{memoir}",
  ])
    assert.equal(toPdfLatex(doc(head)), doc(head));
});
