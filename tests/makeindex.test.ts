import { test } from "node:test";
import assert from "node:assert/strict";
import { makeIndex, parseEntry } from "../src/tex/makeindex.ts";
import { compareMongolian, letterGroup } from "../src/tex/mncollate.ts";

const MAKEINDEX_A = {
  idx: '\\indexentry{gamma}{7}\n\\indexentry{alpha}{1}\n\\indexentry{alpha}{3}\n\\indexentry{alpha}{4}\n\\indexentry{alpha}{5}\n\\indexentry{alpha!beta}{2}\n\\indexentry{alpha!beta!deep}{9}\n\\indexentry{zeta|textbf}{4}\n\\indexentry{zeta}{5}\n\\indexentry{range|(}{10}\n\\indexentry{range}{11}\n\\indexentry{range|)}{14}\n\\indexentry{sorted@\\emph{Sorted}}{6}\n\\indexentry{quote"!mark}{8}\n\\indexentry{see|see{alpha}}{3}\n\\indexentry{1990s}{2}\n\\indexentry{$\\alpha$@\\$alpha}{2}\n\\indexentry{two}{1}\n\\indexentry{two}{2}\n\\indexentry{roman}{iv}\n\\indexentry{roman}{ii}\n\\indexentry{roman}{3}\n',
  ind: "\\begin{theindex}\n\n  \\item \\$alpha, 2\n  \\item 1990s, 2\n\n  \\indexspace\n\n  \\item alpha, 1, 3--5\n    \\subitem beta, 2\n      \\subsubitem deep, 9\n\n  \\indexspace\n\n  \\item gamma, 7\n\n  \\indexspace\n\n  \\item quote!mark, 8\n\n  \\indexspace\n\n  \\item range, 10--14\n  \\item roman, ii, iv, 3\n\n  \\indexspace\n\n  \\item see, \\see{alpha}{3}\n  \\item \\emph{Sorted}, 6\n\n  \\indexspace\n\n  \\item two, 1, 2\n\n  \\indexspace\n\n  \\item zeta, \\textbf{4}, 5\n\n\\end{theindex}\n",
};
const MAKEINDEX_B = {
  idx: '\\indexentry{a|(textbf}{2}\n\\indexentry{a|)textbf}{6}\n\\indexentry{b|(}{3}\n\\indexentry{b|)}{3}\n\\indexentry{c}{1}\n\\indexentry{c}{2}\n\\indexentry{c|textit}{3}\n\\indexentry{c}{4}\n\\indexentry{c}{5}\n\\indexentry{c}{6}\n\\indexentry{c}{6}\n\\indexentry{d!x}{1}\n\\indexentry{d}{2}\n\\indexentry{e"@f}{1}\n\\indexentry{g"|h}{2}\n\\indexentry{Apple}{1}\n\\indexentry{apple}{2}\n',
  ind: "\\begin{theindex}\n\n  \\item a, \\textbf{2--6}\n  \\item Apple, 1\n  \\item apple, 2\n\n  \\indexspace\n\n  \\item b, 3\n\n  \\indexspace\n\n  \\item c, 1, 2, \\textit{3}, 4--6\n\n  \\indexspace\n\n  \\item d, 2\n    \\subitem x, 1\n\n  \\indexspace\n\n  \\item e@f, 1\n\n  \\indexspace\n\n  \\item g|h, 2\n\n\\end{theindex}\n",
};

test("makeindex програмын гаралттай яг ижил индекс үүсгэнэ", () => {
  assert.equal(makeIndex(MAKEINDEX_A.idx), MAKEINDEX_A.ind);
  assert.equal(makeIndex(MAKEINDEX_B.idx), MAKEINDEX_B.ind);
});

test("монгол цагаан толгойн дарааллаар эрэмбэлнэ", () => {
  const alphabet = [..."абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя"];
  const shuffled = [...alphabet].reverse();
  assert.deepEqual(shuffled.sort(compareMongolian), alphabet);
  assert.deepEqual(
    ["ёс", "еэ", "ест", "өдөр", "орой", "үүр", "уул", "Ус"].sort(
      compareMongolian,
    ),
    ["ест", "еэ", "ёс", "орой", "өдөр", "Ус", "уул", "үүр"],
  );
  assert.deepEqual(
    ["zebra", "алим", "2", "$", "яс", "apple"].sort(compareMongolian),
    ["$", "2", "алим", "яс", "apple", "zebra"],
  );
  assert.equal(letterGroup("өдөр"), "Ө");
  assert.equal(letterGroup("Ёс"), "Ё");
  assert.equal(letterGroup("1990"), "");
});

test("монгол үгсийн индексийг үсгээр бүлэглэнэ", () => {
  const idx = [
    "\\indexentry{өвөл}{3}",
    "\\indexentry{ой}{1}",
    "\\indexentry{ёс}{2}",
    "\\indexentry{ес}{4}",
    "\\indexentry{өвөл!хүйтэн}{5}",
  ].join("\n");
  assert.equal(
    makeIndex(idx),
    [
      "\\begin{theindex}",
      "",
      "  \\item ес, 4",
      "",
      "  \\indexspace",
      "",
      "  \\item ёс, 2",
      "",
      "  \\indexspace",
      "",
      "  \\item ой, 1",
      "",
      "  \\indexspace",
      "",
      "  \\item өвөл, 3",
      "    \\subitem хүйтэн, 5",
      "",
      "\\end{theindex}",
      "",
    ].join("\n"),
  );
});

test("хөрвүүлэгчийн ^^xx байтаар бичсэн кирилл үсгийг зөв эрэмбэлнэ", () => {
  const bytes = (word: string): string =>
    [...new TextEncoder().encode(word)]
      .map((byte) => "^^" + byte.toString(16).padStart(2, "0"))
      .join("");
  const idx = ["ой", "ёс", "ес", "өвөл"]
    .map((word) => "\\indexentry{" + bytes(word) + "}{1}")
    .join("\n");
  const items = makeIndex(idx)
    .split("\n")
    .filter((line) => line.includes("\\item"))
    .map((line) => line.trim());
  assert.deepEqual(items, [
    "\\item ес, 1",
    "\\item ёс, 1",
    "\\item ой, 1",
    "\\item өвөл, 1",
  ]);
});

test("буруу бичлэгийг алгасна", () => {
  assert.equal(parseEntry("", "1"), null);
  assert.equal(parseEntry("a!@b", "1"), null);
  assert.equal(
    makeIndex("\\indexentry{a}{1}\n\\indexentry{broken\n\\indexentry{b}"),
    "\\begin{theindex}\n\n  \\item a, 1\n\n\\end{theindex}\n",
  );
  assert.equal(makeIndex(""), "\\begin{theindex}\n\n\\end{theindex}\n");
});

test("ижил түлхүүртэй бичлэгийг харагдах бичвэрээр нь эрэмбэлнэ", () => {
  assert.equal(
    makeIndex("\\indexentry{a@y}{2}\n\\indexentry{a@x}{1}\n"),
    "\\begin{theindex}\n\n  \\item x, 1\n  \\item y, 2\n\n\\end{theindex}\n",
  );
});
