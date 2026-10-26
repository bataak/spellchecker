import test from "node:test";
import assert from "node:assert/strict";

import {
  STYLE,
  blockRuns,
  isTocLevel,
  runsText,
  tocEntries,
  withToc,
  type DocIr,
  type IrBlock,
} from "../src/office/docir.ts";
import { mapDeck, type DeckDoc, type DeckSlide } from "../src/office/deck.ts";

const run = (text: string) => ({ text });

function docOf(blocks: IrBlock[]): DocIr {
  return {
    blocks,
    styles: {
      Heading1: { outlineLevel: 1 },
      Heading2: { outlineLevel: 2 },
      Heading4: { outlineLevel: 4 },
    },
    font: { family: "Arial", sizePt: 12 },
    page: {
      widthCm: 21,
      heightCm: 29.7,
      marginTopCm: 2,
      marginBottomCm: 2,
      marginInnerCm: 3,
      marginOuterCm: 1.5,
      mirrored: false,
    },
  } as DocIr;
}

test("docir: tocEntries зөвхөн 1–3 түвшний гарчгийг дарааллаар нь авна", () => {
  const doc = docOf([
    { kind: "para", style: "Heading1", runs: [run("Нэг")] },
    { kind: "para", style: STYLE.body, runs: [run("текст")] },
    { kind: "para", style: "Heading4", runs: [run("Дөрөв")] },
    { kind: "para", style: "Heading2", runs: [run("Хо"), run("ёр")] },
    { kind: "rule" },
  ]);
  assert.deepEqual(
    tocEntries(doc).map((entry) => [entry.level, runsText(entry.runs)]),
    [
      [1, "Нэг"],
      [2, "Хоёр"],
    ],
  );
  assert.deepEqual([0, 1, 3, 4].map(isTocLevel), [false, true, true, false]);
});

test("docir: withToc гарчиг/нүүр хуудасны дараа, эс бөгөөс эхэнд оруулна", () => {
  const titled = docOf([
    { kind: "para", style: STYLE.title, runs: [run("T")] },
    { kind: "para", style: STYLE.body, runs: [run("b")] },
  ]);
  assert.deepEqual(withToc(titled, ["t", "b"], "toc"), ["t", "toc", "b"]);
  const plain = docOf([{ kind: "para", style: STYLE.body, runs: [run("b")] }]);
  assert.deepEqual(withToc(plain, ["b"], "toc"), ["toc", "b"]);
  assert.deepEqual(withToc(docOf([]), [], "toc"), ["toc"]);
});

test("docir: blockRuns жагсаалт, хүснэгтийн run-уудыг хавтгайруулна", () => {
  assert.deepEqual(
    blockRuns({
      kind: "list",
      ordered: false,
      start: 1,
      style: STYLE.listItem,
      items: [[run("a")], [run("b")]],
    }).map((r) => r.text),
    ["a", "b"],
  );
  assert.deepEqual(
    blockRuns({
      kind: "table",
      align: [null, null],
      rows: [[[run("1")], [run("2")]]],
    }).map((r) => r.text),
    ["1", "2"],
  );
  assert.deepEqual(blockRuns({ kind: "break" }), []);
});

test("deck: mapDeck нүүр, бүлэг, агуулгын слайдыг дарааллаар нь зочилно", () => {
  const slide = (title: string, section = false): DeckSlide => ({
    title: [run(title)],
    lines: [],
    parts: [],
    notes: [],
    section,
  });
  const doc = {
    title: [run("Нүүр")],
    subtitle: [],
    slides: [slide("A"), slide("B", true), slide("C")],
  } as unknown as DeckDoc;
  const seen = mapDeck(doc, {
    cover: (title) => "cover:" + runsText(title),
    section: (s) => "section:" + runsText(s.title ?? []),
    content: (s) => "content:" + runsText(s.title ?? []),
  });
  assert.deepEqual(seen, ["cover:Нүүр", "content:A", "section:B", "content:C"]);
  const untitled = { ...doc, title: null } as DeckDoc;
  assert.equal(
    mapDeck(untitled, {
      cover: () => 0,
      section: () => 1,
      content: () => 2,
    }).length,
    3,
  );
});
