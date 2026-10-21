import { test } from "node:test";
import assert from "node:assert/strict";
import {
  locate,
  locateSource,
  pdfWordAt,
  pdfWords,
  sourceWords,
} from "../src/tex/texsync.ts";

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

const PHRASE =
  "энэ хэллэг баримтад гурван удаа яг ижил үгээр давтагдан бичигдсэн байгаа юм";

function filler(word: string, count: number): string {
  return Array.from({ length: count }, (_, i) => word + i).join(" ");
}

test("давтагдсан хэллэгийн хэд дэхийг тоолж олно", () => {
  const tex = [
    PHRASE,
    filler("эхний", 10),
    PHRASE,
    filler("хоёрдахь", 10),
    PHRASE,
  ].join("\n");
  const pages = [
    [
      { text: PHRASE, y: 700 },
      { text: filler("оруулсан", 200), y: 600 },
    ],
    [
      { text: PHRASE, y: 500 },
      { text: filler("хоёрдахь", 10), y: 400 },
    ],
    [{ text: PHRASE, y: 300 }],
  ];
  const words = pdfWords(pages, [800, 800, 800]);
  const src = sourceWords(tex);
  const middle = (n: number): number => {
    let at = -1;
    for (let i = 0; i <= n; i++) at = tex.indexOf(PHRASE, at + 1);
    return at + PHRASE.indexOf("ижил");
  };
  assert.equal(locate(src, middle(0), words)!.page, 1);
  assert.equal(locate(src, middle(1), words)!.page, 2);
  assert.equal(locate(src, middle(2), words)!.page, 3);
});

test("гарчгийн жагсаалтад давхардсан гарчгийг алгасна", () => {
  const heading = "Хувиргагч архитектурын үндсэн бүтэц ба ажиллах зарчим";
  const tex = [
    "\\tableofcontents",
    "\\section{" + heading + "}",
    "Энд догол мөрийн бичвэр байна.",
  ].join("\n");
  const pages = [
    [{ text: "1 " + heading + " 2", y: 700 }],
    [
      { text: "1 " + heading, y: 700 },
      { text: "Энд догол мөрийн бичвэр байна.", y: 680 },
    ],
  ];
  const words = pdfWords(pages, [800, 800]);
  const hit = locate(sourceWords(tex), tex.indexOf("бүтэц"), words)!;
  assert.equal(hit.page, 2);
});

test("PDF дээр дарсан цэгийн үгийг олно", () => {
  const pages = [
    [
      { text: "нэг хоёр гурав", y: 700, left: 100, right: 400 },
      { text: "дөрөв тав", y: 680, left: 100, right: 300 },
    ],
  ];
  const words = pdfWords(pages, [800], [500]);
  const at = (x: number, y: number) => words[pdfWordAt(words, 1, x, y)]!.word;
  assert.equal(at(0.25, 1 - 700 / 800), "нэг");
  assert.equal(at(0.7, 1 - 700 / 800), "гурав");
  assert.equal(at(0.5, 1 - 681 / 800), "тав");
  assert.equal(pdfWordAt(words, 2, 0.5, 0.5), -1);
});

test("PDF-ийн үгээс эх бичвэрийн байрлалыг олно", () => {
  const src = sourceWords(TEX);
  const index = pdf.findIndex((w) => w.word === "механизм");
  const hit = locateSource(src, pdf, index)!;
  assert.equal(TEX.slice(hit.at, hit.at + 8), "механизм");
  const split = pdf.findIndex((w) => w.word === "суралцдаг");
  const joined = locateSource(src, pdf, split)!;
  assert.equal(TEX.slice(joined.at, joined.at + 9), "суралцдаг");
});

test("давтагдсан хэллэгийг PDF-ээс эх уруу буцааж тоолно", () => {
  const tex = [PHRASE, filler("а", 10), PHRASE, filler("б", 10), PHRASE].join(
    "\n",
  );
  const pages = [
    [
      { text: PHRASE, y: 700 },
      { text: filler("в", 200), y: 600 },
    ],
    [
      { text: PHRASE, y: 500 },
      { text: filler("б", 10), y: 400 },
    ],
    [{ text: PHRASE, y: 300 }],
  ];
  const words = pdfWords(pages, [800, 800, 800]);
  const src = sourceWords(tex);
  const nth = (n: number): number => {
    let at = -1;
    for (let i = 0; i <= n; i++) at = tex.indexOf(PHRASE, at + 1);
    return at;
  };
  for (const page of [1, 2, 3]) {
    const index = words.findIndex((w) => w.page === page && w.word === "ижил");
    const hit = locateSource(src, words, index)!;
    assert.ok(hit.at > nth(page - 1) && hit.at < nth(page - 1) + PHRASE.length);
  }
});
