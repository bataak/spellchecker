import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";

import { toLatex } from "../src/latex.ts";
import { parse } from "../src/markdown.ts";
import { applyTemplate } from "../src/office/apply.ts";
import { docImages, imageKey, imageSizeCm } from "../src/office/docir.ts";
import type { EmbeddedImage } from "../src/office/docir.ts";
import { buildDocx } from "../src/office/docx/create.ts";
import { buildOdt } from "../src/office/odt/create.ts";
import { findTemplate } from "../src/templates.ts";

const MD = "Хавсралт:\n\n![](id.jpg){width=50%}\n\n![](lost.png)";
const PNG = new Uint8Array([137, 80, 78, 71]);

function setup() {
  const doc = applyTemplate(parse(MD), findTemplate("letter")!);
  const [shown] = docImages(doc);
  const file: EmbeddedImage = {
    bytes: PNG,
    ext: "png",
    widthPx: 400,
    heightPx: 300,
  };
  return { doc, images: new Map([[imageKey(shown!), file]]) };
}

test("imageSizeCm: хувиар өгсөн өргөн, хуудаснаас хэтрэхгүй өндөр", () => {
  const { doc } = setup();
  const size = imageSizeCm(
    { src: "a", widthPercent: 50 },
    { widthPx: 400, heightPx: 300 },
    doc.page,
  );
  assert.equal(size.widthCm, 8.25);
  assert.equal(size.heightCm, 6.1875);
  const tall = imageSizeCm(
    { src: "a" },
    { widthPx: 1000, heightPx: 10000 },
    doc.page,
  );
  assert.equal(tall.heightCm, 24.7);
});

test("buildDocx: зургийг media файл, холбоостой inline зураг болгоно", () => {
  const { doc, images } = setup();
  const files = unzipSync(buildDocx(doc, { images }));
  assert.deepEqual(files["word/media/image1.png"], PNG);
  const xml = strFromU8(files["word/document.xml"]!);
  assert.equal(xml.match(/<w:drawing>/g)?.length, 1);
  assert.match(xml, /<wp:extent cx="2970000" cy="2227500"\/>/);
  const rels = strFromU8(files["word/_rels/document.xml.rels"]!);
  const id = /<a:blip r:embed="(rId\d+)"/.exec(xml)?.[1];
  assert.match(
    rels,
    new RegExp('Id="' + id + '"[^>]*Target="media/image1.png"'),
  );
  assert.match(
    strFromU8(files["[Content_Types].xml"]!),
    /<Default Extension="png" ContentType="image\/png"\/>/,
  );
});

test("buildOdt: зургийг Pictures хавтаст хийж manifest-д бүртгэнэ", () => {
  const { doc, images } = setup();
  const files = unzipSync(buildOdt(doc, { images }));
  assert.deepEqual(files["Pictures/image1.png"], PNG);
  const xml = strFromU8(files["content.xml"]!);
  assert.match(
    xml,
    /<draw:frame draw:style-name="Fimage" draw:name="Image1" text:anchor-type="as-char" svg:width="8\.250cm" svg:height="6\.188cm"/,
  );
  assert.match(xml, /style:name="Fimage" style:family="graphic"/);
  assert.match(
    strFromU8(files["META-INF/manifest.xml"]!),
    /full-path="Pictures\/image1.png" manifest:media-type="image\/png"/,
  );
});

test("buildOdt: зураггүй баримтад зургийн загвар нэмэхгүй", () => {
  const doc = applyTemplate(parse("Бие."), findTemplate("letter")!);
  const xml = strFromU8(unzipSync(buildOdt(doc))["content.xml"]!);
  assert.doesNotMatch(xml, /Fimage/);
});

test("toLatex: зургийг голлуулж, graphicx-ийг зөвхөн хэрэгтэй үед нэмнэ", () => {
  const tex = toLatex(parse("![](үнэмлэх%20%281%29.jpg){width=60% rotate=90}"));
  assert.match(tex, /\\usepackage\{graphicx\}/);
  assert.match(
    tex,
    /\\begin\{center\}\n\\includegraphics\[angle=90,width=0\.6\\linewidth,height=0\.85\\textheight,keepaspectratio\]\{үнэмлэх \(1\)\.jpg\}\n\\end\{center\}/,
  );
  assert.doesNotMatch(toLatex(parse("Бие.")), /graphicx/);
});
