import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { splitSlides } from "../src/doc/slides.ts";
import { deckDoc } from "../src/office/deck.ts";
import { buildOdp } from "../src/office/odp/create.ts";
import { buildPptx } from "../src/office/pptx/create.ts";

const SAMPLE =
  "# Нэр\n\nБ. Болд\n\n## Нэг\n\n- а\n- б\n\n## Хоёр\n\n3. в\n4. г\n\n" +
  "| A | B |\n| - | - |\n| 1 | 2 |\n\n---\n\n[холбоос](https://a.mn)";

const deck = (md: string) => deckDoc(splitSlides(parse(md)));

const files = (bytes: Uint8Array): Record<string, string> =>
  Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]),
  );

test("splitSlides: гарчиг, дэд гарчиг, слайдууд", () => {
  const d = splitSlides(parse(SAMPLE));
  assert.deepEqual(d.title, [{ type: "text", value: "Нэр" }]);
  assert.equal(d.subtitle.length, 1);
  assert.deepEqual(
    d.slides.map((s) => s.title?.[0]),
    [
      { type: "text", value: "Нэг" },
      { type: "text", value: "Хоёр" },
      undefined,
    ],
  );
});

test("splitSlides: # гарчиггүй бол эхний догол слайд болно", () => {
  const d = splitSlides(parse("Догол\n\n## Нэг"));
  assert.equal(d.title, null);
  assert.equal(d.slides.length, 2);
  assert.equal(d.slides[0]!.title, null);
});

test("deckDoc: жагсаалт, хүснэгтийн мөр", () => {
  const d = deck(SAMPLE);
  assert.deepEqual(
    d.slides[0]!.lines.map((l) => l.kind),
    ["bullet", "bullet"],
  );
  const second = d.slides[1]!.lines;
  assert.equal(second[0]!.kind, "number");
  assert.equal(second[0]!.start, 3);
  assert.equal(second[1]!.start, undefined);
  assert.deepEqual(second[2]!.runs, [
    { text: "A", bold: true },
    { text: " | ", bold: true },
    { text: "B", bold: true },
  ]);
});

test("buildOdp: хуудас бүр draw:page", () => {
  const out = files(buildOdp(deck(SAMPLE)));
  assert.equal(
    out["mimetype"],
    "application/vnd.oasis.opendocument.presentation",
  );
  const content = out["content.xml"]!;
  assert.equal(content.match(/<draw:page /g)?.length, 4);
  assert.ok(content.includes('text:start-value="3"'));
  assert.ok(content.includes('xlink:href="https://a.mn"'));
  assert.ok(out["styles.xml"]!.includes('fo:page-width="28.00cm"'));
});

test("buildPptx: слайд, холбоосын харьцаа", () => {
  const out = files(buildPptx(deck(SAMPLE)));
  const slides = Object.keys(out).filter((k) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(k),
  );
  assert.equal(slides.length, 4);
  assert.equal(out["ppt/presentation.xml"]!.match(/<p:sldId /g)?.length, 4);
  assert.ok(out["ppt/slides/slide3.xml"]!.includes('startAt="3"'));
  const rels = out["ppt/slides/_rels/slide4.xml.rels"]!;
  assert.ok(rels.includes('Target="https://a.mn" TargetMode="External"'));
  assert.ok(
    out["ppt/slides/slide4.xml"]!.includes('<a:hlinkClick r:id="rId2"/>'),
  );
});

test("deckDoc: YAML нүүр, бүлэг, багана, тэмдэглэл", () => {
  const md =
    "---\ntitle: Илтгэл\nauthor: Бат\ndate: 2026\n---\n\n# Бүлэг\n\n## Слайд\n\n" +
    ":::::: {.columns}\n::: {.column}\nНэг\n:::\n::: {.column}\nХоёр\n:::\n::::::\n\n" +
    "::: notes\nТэмдэглэл\n:::\n";
  const doc = deckDoc(splitSlides(parse(md)));
  const text = (runs: readonly { text: string }[]): string =>
    runs.map((run) => run.text).join("");
  assert.equal(text(doc.title ?? []), "Илтгэл");
  assert.deepEqual(doc.subtitle.map(text), ["Бат", "2026"]);
  assert.equal(doc.slides[0]?.section, true);
  assert.deepEqual(
    doc.slides[1]?.lines.map((line) => text(line.runs)),
    ["Нэг", "Хоёр"],
  );
  assert.deepEqual(
    doc.slides[1]?.notes.map((line) => text(line.runs)),
    ["Тэмдэглэл"],
  );
});

test("илтгэлийн хүснэгт ODP, PPTX-д жинхэнэ хүснэгт болно", () => {
  const md =
    "## Слайд\n\nӨмнө\n\n| Машин | Тоо |\n| :-- | --: |\n| №1 | 702 |\n\nДараа\n";
  const doc = deckDoc(splitSlides(parse(md)));
  assert.deepEqual(
    doc.slides[0]!.parts.map((part) => part.kind),
    ["text", "table", "text"],
  );
  const odp = files(buildOdp(doc))["content.xml"]!;
  assert.ok(odp.includes("<table:table>"), odp);
  assert.equal(odp.match(/<table:table-row /g)?.length, 2);
  assert.ok(odp.includes('fo:text-align="end"'));
  const pptx = files(buildPptx(doc))["ppt/slides/slide1.xml"]!;
  assert.ok(pptx.includes("<a:tbl>"), pptx);
  assert.equal(pptx.match(/<a:tr /g)?.length, 2);
  assert.ok(pptx.includes('<a:pPr algn="r"/>'));
});

test("buildPptx: илтгэгчийн тэмдэглэлийг notesSlide болгоно", () => {
  const md =
    "# Илтгэл\n\n## Нэг\n\nАгуулга\n\n::: notes\nЭхний тэмдэглэл\n:::\n\n## Хоёр\n\nТэмдэглэлгүй\n";
  const out = files(buildPptx(deck(md)));
  assert.ok(out["ppt/notesMasters/notesMaster1.xml"]);
  assert.ok(
    out["ppt/notesSlides/notesSlide2.xml"]!.includes("Эхний тэмдэглэл"),
  );
  assert.equal(out["ppt/notesSlides/notesSlide3.xml"], undefined);
  assert.match(out["ppt/slides/_rels/slide2.xml.rels"]!, /notesSlide2\.xml/);
  assert.doesNotMatch(out["ppt/slides/_rels/slide3.xml.rels"]!, /notesSlide/);
  assert.match(out["ppt/presentation.xml"]!, /<p:notesMasterIdLst>/);
  assert.match(out["[Content_Types].xml"]!, /notesSlide2\.xml/);
});

test("buildPptx: тэмдэглэлгүй бол notes хэсэг үүсгэхгүй", () => {
  const out = files(buildPptx(deck("# Илтгэл\n\n## Нэг\n\nАгуулга\n")));
  assert.equal(
    Object.keys(out).some((name) => name.includes("notes")),
    false,
  );
  assert.doesNotMatch(out["ppt/presentation.xml"]!, /notesMaster/);
});

test("слайд: .grid тор, width зураасны харьцаа ба row өндрийг хүндэтгэнэ", () => {
  const md =
    '## Слайд\n\n::: {width="100%" .grid row="2cm"}\n| А | Б |\n| --- | --------- |\n| 1 | 2 |\n:::\n';
  const doc = deck(md);
  const part = doc.slides[0]!.parts[0]!;
  assert.equal(part.kind, "table");
  const table = part.kind === "table" ? part.table : null;
  assert.equal(table?.strokes.columns, 1);
  assert.equal(table?.share, 1);
  assert.equal(table?.rowCm, 2);
  const odp = files(buildOdp(doc))["content.xml"]!;
  assert.match(
    odp,
    /style:name="ce_1111m"[^]*?fo:border-top="0\.75pt solid #000000" fo:border-bottom="0\.75pt solid #000000" fo:border-left="0\.75pt solid #000000" fo:border-right="0\.75pt solid #000000"/,
  );
  const widths = [...odp.matchAll(/style:column-width="([\d.]+)cm"/g)].map(
    (m) => Number(m[1]),
  );
  assert.ok(Math.abs(widths[1]! / widths[0]! - 3) < 0.01, String(widths));
  assert.match(odp, /style:row-height="2(\.0+)?cm"/);
  const pptx = files(buildPptx(doc))["ppt/slides/slide1.xml"]!;
  assert.match(pptx, /<a:lnL w="9525"><a:solidFill>/);
  assert.match(pptx, /<a:lnR w="9525"><a:solidFill>/);
});

test("слайд: гарчиггүй энгийн хүснэгт дээд, доод зузаан зураастай хэвээр", () => {
  const doc = deck("## Слайд\n\n|   |   |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n");
  const part = doc.slides[0]!.parts[0]!;
  const strokes = part.kind === "table" ? part.table.strokes : null;
  assert.equal(strokes?.top, 2);
  assert.equal(strokes?.bottom, 2);
  assert.equal(strokes?.rows, 0);
  const pptx = files(buildPptx(doc))["ppt/slides/slide1.xml"]!;
  assert.match(pptx, /<a:lnT w="19050"><a:solidFill>/);
  assert.match(pptx, /<a:lnB w="19050"><a:solidFill>/);
});
