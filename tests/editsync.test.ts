import assert from "node:assert/strict";
import { test } from "node:test";

import { installDom } from "./helpers/dom.ts";

const dom = installDom();
const { applyEdit, syncEdits } = await import("../src/office/editsync.ts");
const { renderFlat } = await import("../src/office/textdoc.ts");
const { parse } = await import("../src/markdown.ts");
const { findTemplate } = await import("../src/doc/templates.ts");
const { applyTemplate } = await import("../src/office/apply.ts");
const { buildDocx } = await import("../src/office/docx/create.ts");
const { openDocx, saveDocx } = await import("../src/office/docx/index.ts");

test.after(() => dom.close());

type Edit = { start: number; end: number; text: string };

function chain(source: string, texts: string[]): Edit[] {
  let edits: Edit[] = [];
  let shown = source;
  for (const text of texts) {
    const next = syncEdits(source, edits, shown, text);
    assert.notEqual(next, null, `${shown} → ${text}`);
    edits = next!;
    shown = text;
    assert.equal(renderFlat(source, edits), text);
  }
  return edits;
}

test("зөвхөн нэмсэн үсгийг дахин засахад нэг засвар болж нэгдэнэ", () => {
  assert.deepEqual(chain("сан байна", ["санаа байна", "санал байна"]), [
    { start: 3, end: 3, text: "ал" },
  ]);
});

test("засварын хагасыг давхцуулж өөрчлөхөд үлдсэн хэсэг нь алдагдахгүй", () => {
  const edits = chain("байнга бичнэ", ["байнаа бичнэ", "байхаа бичнэ"]);
  assert.equal(edits.length, 1);
  assert.equal(renderFlat("байнга бичнэ", edits), "байхаа бичнэ");
});

test("хоёр засварыг хамарсан өөрчлөлт нэг засвар болно", () => {
  const source = "абвгдеж";
  const edits = applyEdit(
    source,
    [
      { start: 1, end: 2, text: "XX" },
      { start: 4, end: 5, text: "YY" },
    ],
    2,
    6,
    "Z",
  );
  assert.deepEqual(edits, [{ start: 1, end: 5, text: "XZY" }]);
  assert.equal(renderFlat(source, edits), "аXZYеж");
});

test("зөрсөн буюу мөрийн тоо өөрчилсөн бичвэрийг төлөв өөрчлөхгүйгээр татгалзана", () => {
  assert.equal(syncEdits("нэг", [], "хоёр", "гурав"), null);
  assert.equal(syncEdits("нэг", [], "нэг", "нэг\nхоёр"), null);
});

test("дурын дараалсан засвар үргэлж яг харагдах бичвэрийг өгнө", () => {
  let seed = 12345;
  const random = (limit: number): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % limit;
  };
  const piece = (max: number): string =>
    Array.from({ length: random(max + 1) }, () => "абв гд"[random(6)]).join("");

  for (let round = 0; round < 2000; round++) {
    const source = Array.from({ length: 1 + random(3) }, () => piece(10)).join(
      "\n",
    );
    let edits: Edit[] = [];
    let shown = source;
    for (let turn = 0; turn < 6; turn++) {
      const lines = shown.split("\n");
      const at = random(lines.length);
      const line = lines[at]!;
      const from = random(line.length + 1);
      const to = from + random(line.length - from + 1);
      lines[at] = line.slice(0, from) + piece(4) + line.slice(to);
      const next = lines.join("\n");
      const synced = syncEdits(source, edits, shown, next);
      assert.notEqual(synced, null, JSON.stringify({ source, shown, next }));
      edits = synced!;
      shown = next;
      for (let i = 1; i < edits.length; i++)
        assert.ok(edits[i - 1]!.end < edits[i]!.start);
    }
  }
});

test("дахин засвар бодит docx файлд харагдсантай ижил бичигдэнэ", () => {
  const doc = openDocx(
    buildDocx(applyTemplate(parse("Энэ сан байна"), findTemplate("report")!), {
      toc: false,
    }),
  );
  const source = doc.text;
  const first = source.replace("сан байна", "санаа байна");
  const second = source.replace("сан байна", "санал байна");
  const edits = chain(source, [first, second]);
  const saved = saveDocx(doc, edits);
  assert.equal(saved.skipped.length, 0);
  assert.equal(openDocx(saved.bytes).text, second);
});
