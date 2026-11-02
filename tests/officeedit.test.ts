import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { syncEdits } from "../src/office/editsync.ts";
import { openDocx, saveDocx } from "../src/office/docx/index.ts";
import { openOdf, saveOdf } from "../src/office/odf/index.ts";
import { openPptx, savePptx } from "../src/office/pptx/index.ts";
import type { SaveResult, TextEdit, TextIndex } from "../src/office/textdoc.ts";

const DOCX_PART = "word/document.xml";
const PPTX_PART = "ppt/slides/slide1.xml";
const ODF_PART = "content.xml";

const docx = (body: string): Uint8Array =>
  zipSync({
    [DOCX_PART]: strToU8(`<w:document><w:body>${body}</w:body></w:document>`),
  });
const pptx = (body: string): Uint8Array =>
  zipSync({
    [PPTX_PART]: strToU8(`<p:sld><p:txBody>${body}</p:txBody></p:sld>`),
  });
const odt = (body: string): Uint8Array =>
  zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    [ODF_PART]: strToU8(`<office:text>${body}</office:text>`),
  });

function replaceWord<D extends TextIndex>(
  doc: D,
  save: (doc: D, edits: TextEdit[]) => SaveResult,
  from: string,
  to: string,
): SaveResult {
  const start = doc.text.indexOf(from);
  assert.ok(start >= 0, doc.text);
  const result = save(doc, [{ start, end: start + from.length, text: to }]);
  assert.equal(result.skipped.length, 0);
  return result;
}

const partOf = (result: SaveResult, name: string): string =>
  strFromU8(unzipSync(result.bytes)[name]!);

test("pptx: a:t-д xml:space шинж бичихгүй", () => {
  const bytes = pptx(
    "<a:p><a:r><a:t>сан </a:t></a:r><a:r><a:t>байна</a:t></a:r></a:p>",
  );
  const result = replaceWord(openPptx(bytes), savePptx, "сан", "санаа");
  const xml = partOf(result, PPTX_PART);
  assert.ok(xml.includes("<a:t>санаа </a:t>"), xml);
  assert.equal(openPptx(result.bytes).text, "санаа байна");
});

test("docx: w:t-д xml:space шинж хэвээр нэмэгдэнэ", () => {
  const bytes = docx(
    "<w:p><w:r><w:t>сан </w:t></w:r><w:r><w:t>байна</w:t></w:r></w:p>",
  );
  const result = replaceWord(openDocx(bytes), saveDocx, "сан", "санаа");
  assert.ok(
    partOf(result, DOCX_PART).includes(
      '<w:t xml:space="preserve">санаа </w:t>',
    ),
  );
});

test("odt: үгийн төгсгөлд нэмэхэд дараах таб хэвээр үлдэнэ", () => {
  const bytes = odt("<text:p>Нэг<text:tab/>хоёр</text:p>");
  const result = replaceWord(openOdf(bytes), saveOdf, "Нэг", "Нэгэн");
  assert.ok(
    partOf(result, ODF_PART).includes("<text:p>Нэгэн<text:tab/>хоёр</text:p>"),
  );
});

test("odt: цорын ганц таб дээр нэмэхэд таб хэвээр үлдэнэ", () => {
  const bytes = odt("<text:p><text:tab/></text:p>");
  const result = saveOdf(openOdf(bytes), [{ start: 1, end: 1, text: "X" }]);
  assert.ok(partOf(result, ODF_PART).includes("<text:p><text:tab/>X</text:p>"));
});

test("odt: text:s-ээс зай хасахад үлдсэн зай text:s хэвээр байна", () => {
  const bytes = odt('<text:p>Нэг<text:s text:c="3"/>хоёр</text:p>');
  const result = replaceWord(
    openOdf(bytes),
    saveOdf,
    "Нэг   хоёр",
    "Нэг  хоёр",
  );
  assert.ok(
    partOf(result, ODF_PART).includes(
      '<text:p>Нэг<text:s text:c="2"/>хоёр</text:p>',
    ),
  );
});

test("docx: үгийн төгсгөлд нэмсэн үсэг тухайн үгийн хэлбэржүүлэлттэй байна", () => {
  const bytes = docx(
    '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>сан</w:t></w:r><w:r><w:t xml:space="preserve"> байна</w:t></w:r></w:p>',
  );
  const xml = partOf(
    replaceWord(openDocx(bytes), saveDocx, "сан", "санаа"),
    DOCX_PART,
  );
  assert.ok(xml.includes("<w:b/></w:rPr><w:t>санаа</w:t>"), xml);
  assert.ok(xml.includes('<w:t xml:space="preserve"> байна</w:t>'), xml);
});

test("docx: үгийн эхэнд нэмсэн үсэг тухайн үгийн хэлбэржүүлэлттэй байна", () => {
  const bytes = docx(
    '<w:p><w:r><w:t xml:space="preserve">сан </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>байна</w:t></w:r></w:p>',
  );
  const xml = partOf(
    replaceWord(openDocx(bytes), saveDocx, "байна", "тбайна"),
    DOCX_PART,
  );
  assert.ok(xml.includes('<w:t xml:space="preserve">сан </w:t>'), xml);
  assert.ok(xml.includes("<w:b/></w:rPr><w:t>тбайна</w:t>"), xml);
});

test("pptx: үгийн төгсгөлд нэмсэн үсэг тухайн үгийн run-д орно", () => {
  const bytes = pptx(
    '<a:p><a:r><a:rPr b="1"/><a:t>сан</a:t></a:r><a:r><a:t> байна</a:t></a:r></a:p>',
  );
  const xml = partOf(
    replaceWord(openPptx(bytes), savePptx, "сан", "санаа"),
    PPTX_PART,
  );
  assert.ok(xml.includes('<a:rPr b="1"/><a:t>санаа</a:t>'), xml);
});

test("odt: span-ийн төгсгөлд нэмсэн үсэг span дотор үлдэнэ", () => {
  const bytes = odt(
    '<text:p><text:span text:style-name="B">сан</text:span> байна</text:p>',
  );
  const xml = partOf(
    replaceWord(openOdf(bytes), saveOdf, "сан", "санаа"),
    ODF_PART,
  );
  assert.ok(xml.includes(">санаа</text:span> байна"), xml);
});

test("odt: зургийн гарчиг, тайлбар бичвэрт орохгүй", () => {
  const bytes = odt(
    "<text:p><draw:frame><draw:image/><svg:title>Гарчиг</svg:title><svg:desc>Тайлбар</svg:desc></draw:frame>Бичвэр</text:p>",
  );
  assert.equal(openOdf(bytes).text, "Бичвэр");
});

test("docx: зөөсөн бичвэр зөвхөн шинэ байрандаа уншигдана", () => {
  const moved = "<w:r><w:t>Зөөсөн</w:t></w:r>";
  const bytes = docx(
    `<w:p><w:moveFrom>${moved}</w:moveFrom><w:r><w:t xml:space="preserve"> дунд </w:t></w:r><w:moveTo>${moved}</w:moveTo></w:p>`,
  );
  const doc = openDocx(bytes);
  assert.equal(doc.text, " дунд Зөөсөн");
  const xml = partOf(replaceWord(doc, saveDocx, "Зөөсөн", "Зөөв"), DOCX_PART);
  assert.ok(xml.includes(`<w:moveFrom>${moved}</w:moveFrom>`), xml);
  assert.ok(
    xml.includes("<w:moveTo><w:r><w:t>Зөөв</w:t></w:r></w:moveTo>"),
    xml,
  );
});

const textareaValue = (text: string): string => text.replace(/\r\n?/g, "\n");

function assertSurvivesTextarea<D extends TextIndex>(
  doc: D,
  save: (doc: D, edits: TextEdit[]) => SaveResult,
  open: (bytes: Uint8Array) => D,
): void {
  const shown = textareaValue(doc.text);
  assert.equal(doc.text, shown);
  const fixed = shown.replace("сан", "санаа");
  const edits = syncEdits(doc.text, [], shown, fixed);
  assert.ok(edits !== null);
  const result = save(doc, edits);
  assert.equal(result.skipped.length, 0);
  assert.equal(open(result.bytes).text, fixed);
}

for (const [label, mark] of [
  ["&#13;", "&#13;"],
  ["CRLF", "\r\n"],
  ["CR", "\r"],
] as const) {
  const line = `нэг${mark}сан`;

  test(`docx: ${label} бичвэрт засвар татгалзагдахгүй`, () => {
    const bytes = docx(`<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`);
    assertSurvivesTextarea(openDocx(bytes), saveDocx, openDocx);
  });

  test(`pptx: ${label} бичвэрт засвар татгалзагдахгүй`, () => {
    const bytes = pptx(`<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`);
    assertSurvivesTextarea(openPptx(bytes), savePptx, openPptx);
  });

  test(`odt: ${label} бичвэрт засвар татгалзагдахгүй`, () => {
    const bytes = odt(`<text:p>${line}</text:p>`);
    assertSurvivesTextarea(openOdf(bytes), saveOdf, openOdf);
  });
}

const CDATA = "<![CDATA[A&amp;B <сан>]]>";
const CDATA_TEXT = "A&amp;B <сан>";

test("docx: CDATA доторх бичвэрийг шууд уншиж, зассан ч утга нь хэвээр", () => {
  const bytes = docx(`<w:p><w:r><w:t>компьюте ${CDATA}</w:t></w:r></w:p>`);
  const doc = openDocx(bytes);
  assert.equal(doc.text, `компьюте ${CDATA_TEXT}`);
  const result = replaceWord(doc, saveDocx, "компьюте", "компьютер");
  assert.equal(openDocx(result.bytes).text, `компьютер ${CDATA_TEXT}`);
});

test("pptx: CDATA доторх бичвэрийг шууд уншиж, зассан ч утга нь хэвээр", () => {
  const bytes = pptx(`<a:p><a:r><a:t>компьюте ${CDATA}</a:t></a:r></a:p>`);
  const doc = openPptx(bytes);
  assert.equal(doc.text, `компьюте ${CDATA_TEXT}`);
  const result = replaceWord(doc, savePptx, "компьюте", "компьютер");
  assert.equal(openPptx(result.bytes).text, `компьютер ${CDATA_TEXT}`);
});

test("odt: CDATA дотор зассан бичвэр CDATA-гийн тэмдэгт болж хувирахгүй", () => {
  const bytes = odt("<text:p><![CDATA[компьюте A&amp;B <сан>]]></text:p>");
  const doc = openOdf(bytes);
  assert.equal(doc.text, `компьюте ${CDATA_TEXT}`);
  const result = replaceWord(doc, saveOdf, "компьюте", "компьютер");
  assert.equal(openOdf(result.bytes).text, `компьютер ${CDATA_TEXT}`);
  assert.ok(!partOf(result, ODF_PART).includes("<![CDATA["));
});

test("odt: CDATA-гийн гаднах бичвэрийг зассанд CDATA өөрчлөгдөхгүй", () => {
  const bytes = odt(`<text:p>компьюте ${CDATA}</text:p>`);
  const result = replaceWord(openOdf(bytes), saveOdf, "компьюте", "компьютер");
  assert.ok(partOf(result, ODF_PART).includes(CDATA));
  assert.equal(openOdf(result.bytes).text, `компьютер ${CDATA_TEXT}`);
});

test("CDATA дотор энгийн бичвэрийн entity тайлагдахгүй, мөрийн төгсгөл нэгтгэгдэнэ", () => {
  const bytes = docx(
    "<w:p><w:r><w:t><![CDATA[а&#13;б\r\nв]]></w:t></w:r></w:p>",
  );
  assert.equal(openDocx(bytes).text, "а&#13;б\nв");
});
