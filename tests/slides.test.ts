import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { splitSlides } from "../src/slides.ts";
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
  assert.equal(out["mimetype"], "application/vnd.oasis.opendocument.presentation");
  const content = out["content.xml"]!;
  assert.equal(content.match(/<draw:page /g)?.length, 4);
  assert.ok(content.includes('text:start-value="3"'));
  assert.ok(content.includes('xlink:href="https://a.mn"'));
  assert.ok(out["styles.xml"]!.includes('fo:page-width="28.00cm"'));
});

test("buildPptx: слайд, холбоосын харьцаа", () => {
  const out = files(buildPptx(deck(SAMPLE)));
  const slides = Object.keys(out).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  assert.equal(slides.length, 4);
  assert.equal(out["ppt/presentation.xml"]!.match(/<p:sldId /g)?.length, 4);
  assert.ok(out["ppt/slides/slide3.xml"]!.includes('startAt="3"'));
  const rels = out["ppt/slides/_rels/slide4.xml.rels"]!;
  assert.ok(rels.includes('Target="https://a.mn" TargetMode="External"'));
  assert.ok(out["ppt/slides/slide4.xml"]!.includes('<a:hlinkClick r:id="rId2"/>'));
});
