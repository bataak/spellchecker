import test from "node:test";
import assert from "node:assert/strict";

import { parsePart } from "../src/office/docx/parse.ts";
import { docxUnread, odfUnread } from "../src/office/unread.ts";
import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea>');

const { createOfficeSession } = await import("../src/app/officesession.ts");
const { writeZip } = await import("../src/office/zip.ts");

test.after(() => dom.close());

const encoder = new TextEncoder();
const NOTICE = /Шалгаж чадаагүй хэсэг/;

function odfPackage(body: string, styles = "") {
  return {
    mimetype: "application/vnd.oasis.opendocument.text",
    order: ["content.xml", "styles.xml"],
    entries: {
      "content.xml": encoder.encode(
        "<office:document-content><office:body><office:text>" +
          body +
          "</office:text></office:body></office:document-content>",
      ),
      "styles.xml": encoder.encode(
        "<office:document-styles>" + styles + "</office:document-styles>",
      ),
    },
  };
}

function odt(body: string, styles = ""): File {
  const bytes = writeZip(odfPackage(body, styles));
  return new File([bytes], "a.odt", {
    type: "application/vnd.oasis.opendocument.text",
  });
}

function wordPart(inner: string) {
  return parsePart(
    "word/document.xml",
    '<w:document xmlns:w="w"><w:body>' + inner + "</w:body></w:document>",
  );
}

const BOX_BODY =
  "<text:p>гадна<draw:frame><draw:text-box><text:p>дотор</text:p>" +
  "</draw:text-box></draw:frame></text:p>";
const NOTE_BODY =
  '<text:p>гадна<text:note text:note-class="footnote">' +
  "<text:note-citation>1</text:note-citation><text:note-body>" +
  "<text:p>зүүлт</text:p></text:note-body></text:note></text:p>";
const HEADER_STYLES =
  '<office:master-styles><style:master-page style:name="Standard">' +
  "<style:header><text:p>Толгой</text:p></style:header>" +
  "</style:master-page></office:master-styles>";

test("docxUnread: зөвхөн үгтэй текст хайрцгийг олно", () => {
  const box = (text: string): string =>
    "<w:p><w:r><w:drawing><w:txbxContent><w:p><w:r><w:t>" +
    text +
    "</w:t></w:r></w:p></w:txbxContent></w:drawing></w:r></w:p>";
  assert.deepEqual(docxUnread([wordPart(box("дотор"))]), ["boxes"]);
  assert.deepEqual(docxUnread([wordPart(box("12"))]), []);
  assert.deepEqual(
    docxUnread([wordPart("<w:p><w:r><w:t>гадна</w:t></w:r></w:p>")]),
    [],
  );
});

test("odfUnread: зүүлт, толгой, текст хайрцгийг тогтмол дарааллаар өгнө", () => {
  assert.deepEqual(odfUnread(odfPackage(NOTE_BODY)), ["notes"]);
  assert.deepEqual(odfUnread(odfPackage(BOX_BODY)), ["boxes"]);
  assert.deepEqual(odfUnread(odfPackage("<text:p>а</text:p>", HEADER_STYLES)), [
    "headers",
  ]);
  assert.deepEqual(odfUnread(odfPackage(BOX_BODY + NOTE_BODY, HEADER_STYLES)), [
    "notes",
    "headers",
    "boxes",
  ]);
});

test("odfUnread: шалгагддаг болон бичвэргүй хэсгийг мэдэгдэхгүй", () => {
  const pageAnchored =
    "<draw:frame><draw:text-box><text:p>уншигдана</text:p></draw:text-box></draw:frame>";
  const comment =
    "<text:p>гадна<office:annotation><text:p>сэтгэгдэл</text:p></office:annotation></text:p>";
  const pageNumber =
    "<style:footer><text:p><text:page-number>1</text:page-number></text:p></style:footer>";
  assert.deepEqual(odfUnread(odfPackage(pageAnchored)), []);
  assert.deepEqual(odfUnread(odfPackage(comment)), []);
  assert.deepEqual(odfUnread(odfPackage("<text:p>а</text:p>", pageNumber)), []);
});

function session() {
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const holds: string[] = [];
  const office = createOfficeSession({
    editor: { el: area, settle: async () => undefined } as never,
    status: {
      set: () => undefined,
      hold: (markup: string) => holds.push(markup),
      release: () => undefined,
      shown: () => "",
    } as never,
    showSource: () => undefined,
    baseline: () => undefined,
    syncFixButtons: () => undefined,
    onModeChange: () => undefined,
  });
  return { holds, office };
}

test("officeSession: шалгаж чадаагүй хэсгийг нээхэд мэдэгдэнэ", async () => {
  const { holds, office } = session();
  await office.open(odt(BOX_BODY + NOTE_BODY, HEADER_STYLES));
  assert.deepEqual(holds, [
    "Шалгаж чадаагүй хэсэг: зүүлт, толгой, хөл, текст хайрцаг",
  ]);
  office.close();
  await office.settled();
});

test("officeSession: бүрэн уншигдсан, сэргээсэн файлд мэдэгдэхгүй", async () => {
  const plain = session();
  await plain.office.open(odt("<text:p>бичвэр</text:p>"));
  assert.ok(!plain.holds.some((markup) => NOTICE.test(markup)));
  const restored = session();
  await restored.office.open(odt(BOX_BODY), "гадна");
  assert.ok(!restored.holds.some((markup) => NOTICE.test(markup)));
  plain.office.close();
  restored.office.close();
  await plain.office.settled();
  await restored.office.settled();
});
