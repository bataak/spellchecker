import { test } from "node:test";
import assert from "node:assert/strict";
import { locate, pdfWords, sourceWords } from "../src/texsync.ts";

const TEX = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Оршил}",
  "\\label{sec:intro}",
  "Хиймэл оюун ухааны загварууд хэлний бүтцийг суралцдаг.",
  "% тайлбар мөр",
  "\\begin{figure}[htbp]",
  "\\centering",
  "\\end{figure}",
  "\\subsection{Архитектур}",
  "Трансформер загвар нь \\textbf{анхаарлын} механизм ашиглана.",
  "\\end{document}",
].join("\n");

const PAGES = [
  [
    { text: "1 Оршил", y: 700 },
    { text: "Хиймэл оюун ухааны загварууд хэлний бүтцийг су-", y: 680 },
    { text: "ралцдаг.", y: 668 },
  ],
  [
    { text: "1.1 Архитектур", y: 700 },
    { text: "Трансформер загвар нь анхаарлын механизм ашиглана.", y: 680 },
  ],
];

const pdf = pdfWords(PAGES, [800, 800]);

test("эх бичвэрээс команд, тайлбар, шошгыг хасна", () => {
  const words = sourceWords(TEX).map((w) => w.word);
  assert.ok(words.includes("оршил"));
  assert.ok(words.includes("анхаарлын"));
  for (const hidden of [
    "documentclass",
    "article",
    "intro",
    "тайлбар",
    "figure",
    "htbp",
    "centering",
    "textbf",
  ])
    assert.ok(!words.includes(hidden), hidden);
});

test("мөрийн төгсгөлийн зураасаар таслагдсан үгийг нийлүүлнэ", () => {
  const words = pdf.map((w) => w.word);
  assert.ok(words.includes("суралцдаг"));
  assert.ok(!words.includes("су"));
});

test("заагчийн байрлалыг зөв хуудас, мөрөнд олно", () => {
  const src = sourceWords(TEX);
  const at = (needle: string) => TEX.indexOf(needle);
  const intro = locate(src, at("бүтцийг"), pdf)!;
  assert.equal(intro.page, 1);
  assert.equal(intro.y, 1 - 680 / 800);
  const arch = locate(src, at("механизм"), pdf)!;
  assert.equal(arch.page, 2);
  const figure = locate(src, at("\\centering"), pdf)!;
  assert.ok(figure.page === 1 || figure.page === 2);
});

test("ижил үг давтагдвал байрлалд ойрыг сонгоно", () => {
  const tex =
    "Нэг загвар энд. " + "дүүргэгч үг ".repeat(40) + "Хоёр загвар тэнд.";
  const src = sourceWords(tex);
  const pages = [
    [
      { text: "Нэг загвар энд.", y: 700 },
      { text: "дүүргэгч үг ".repeat(40), y: 600 },
    ],
    [{ text: "Хоёр загвар тэнд.", y: 700 }],
  ];
  const words = pdfWords(pages, [800, 800]);
  assert.equal(locate(src, tex.lastIndexOf("загвар"), words)!.page, 2);
  assert.equal(locate(src, tex.indexOf("загвар"), words)!.page, 1);
});

test("хоосон үед юу ч олохгүй", () => {
  assert.equal(locate([], 0, pdf), null);
  assert.equal(locate(sourceWords(TEX), 0, []), null);
});
