import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";

import { parse } from "../src/markdown.ts";
import { deckDoc, deckImages } from "../src/office/deck.ts";
import { layoutSlide } from "../src/office/decklayout.ts";
import { deckPrintHtml } from "../src/office/deckprint.ts";
import { imageKey } from "../src/office/docir.ts";
import type { EmbeddedImage } from "../src/office/docir.ts";
import { buildOdp } from "../src/office/odp/create.ts";
import { buildPptx } from "../src/office/pptx/create.ts";
import { splitSlides } from "../src/slides.ts";

const MD =
  "## Зураг\n\nТайлбар.\n\n![](a.png) ![](b.png){width=20%}\n\n## Дараах\n\n![](a.png)\n\n![](lost.png)";
const PNG = new Uint8Array([137, 80, 78, 71]);

function setup() {
  const deck = deckDoc(splitSlides(parse(MD)));
  const file: EmbeddedImage = {
    bytes: PNG,
    ext: "png",
    widthPx: 400,
    heightPx: 200,
  };
  const images = new Map(
    deckImages(deck)
      .filter((image) => image.src !== "lost.png")
      .map((image) => [imageKey(image), file]),
  );
  return { deck, images };
}

test("deckDoc: зөвхөн зурагтай догол тусдаа зургийн хэсэг болно", () => {
  const { deck } = setup();
  assert.deepEqual(
    deck.slides[0]!.parts.map((part) => part.kind),
    ["text", "image"],
  );
  assert.deepEqual(
    deckImages(deck).map((image) => image.src),
    ["a.png", "b.png", "a.png", "lost.png"],
  );
});

test("layoutSlide: зургуудыг зэрэгцүүлж голлуулаад, олдоогүйг хасна", () => {
  const { deck, images } = setup();
  const layout = layoutSlide(deck.slides[0]!.parts, 1, 3, 20, 12, (image) =>
    images.get(imageKey(image)),
  );
  const part = layout.parts[1];
  assert.equal(part?.kind, "image");
  if (part?.kind !== "image") return;
  const [a, b] = part.items;
  assert.equal(b!.w, 4);
  assert.equal(b!.h, 2);
  assert.ok(Math.abs(a!.w - 15.6) < 1e-9);
  assert.ok(Math.abs(b!.x - (a!.x + a!.w + 0.4)) < 1e-9);
  const lost = layoutSlide(deck.slides[1]!.parts, 1, 3, 20, 12, (image) =>
    images.get(imageKey(image)),
  );
  assert.equal(lost.parts.length, 1);
});

test("buildPptx: зургийг нэг удаа хадгалж, слайд бүр өөрийн холбоостой", () => {
  const { deck, images } = setup();
  const files = unzipSync(buildPptx(deck, { images }));
  assert.deepEqual(files["ppt/media/image1.png"], PNG);
  assert.deepEqual(files["ppt/media/image2.png"], PNG);
  assert.equal(files["ppt/media/image3.png"], undefined);
  const first = strFromU8(files["ppt/slides/slide1.xml"]!);
  assert.equal(first.match(/<p:pic>/g)?.length, 2);
  const rels = strFromU8(files["ppt/slides/_rels/slide2.xml.rels"]!);
  assert.match(rels, /Target="\.\.\/media\/image1\.png"/);
  assert.match(
    strFromU8(files["[Content_Types].xml"]!),
    /<Default Extension="png" ContentType="image\/png"\/>/,
  );
});

test("buildOdp: зургийг Pictures-д хийж, manifest-д бүртгэнэ", () => {
  const { deck, images } = setup();
  const files = unzipSync(buildOdp(deck, { images }));
  assert.deepEqual(files["Pictures/image1.png"], PNG);
  const xml = strFromU8(files["content.xml"]!);
  assert.equal(xml.match(/<draw:image /g)?.length, 3);
  assert.match(xml, /style:name="gr_img"/);
  assert.match(
    strFromU8(files["META-INF/manifest.xml"]!),
    /full-path="Pictures\/image2.png"/,
  );
});

test("deckPrintHtml: бэлтгэсэн зургийг байрлалтай нь хэвлэнэ", () => {
  const { deck } = setup();
  const ready = { url: "blob:a", blob: null, widthPx: 400, heightPx: 200 };
  const html = deckPrintHtml(
    deck,
    new Map([[imageKey({ src: "a.png" }), ready]]),
  );
  assert.equal(html.match(/<img class="img" alt="" src="blob:a"/g)?.length, 2);
});
