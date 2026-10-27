import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { selectionEdges } from "../src/collab/cursors.ts";

function indexOf(doc: Y.Doc, position: Y.RelativePosition): number {
  return Y.createAbsolutePositionFromRelativePosition(position, doc)!.index;
}

test("сонголтын захад бусад хүн бичихэд сонголт томрохгүй", () => {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, "Эхний. Сүүлийн өгүүлбэр.");
  const start = text.toString().indexOf("Сүүлийн");
  const [anchor, head] = selectionEdges(text, start, text.length, true);
  text.insert(text.length, "\nШинэ мөр");
  text.insert(start, "Өмнө ");
  assert.equal(indexOf(doc, anchor), start + "Өмнө ".length);
  assert.equal(indexOf(doc, head), "Эхний. Өмнө Сүүлийн өгүүлбэр.".length);
});

test("сонголт доторх засвар сонголтод багтаж, чиглэл хадгалагдана", () => {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, "абвгд");
  const [anchor, head] = selectionEdges(text, 1, 4, false);
  text.insert(2, "ЖЖ");
  assert.equal(indexOf(doc, anchor), 6);
  assert.equal(indexOf(doc, head), 1);
  const [caret, same] = selectionEdges(text, 7, 7, true);
  assert.equal(caret, same);
});
