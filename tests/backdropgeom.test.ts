import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("<div></div>");
const geom = await import("../src/editor/backdropgeom.ts");

test.after(() => dom.close());

type Chunk = Parameters<typeof geom.chunkRangeRects>[0];

function chunk(src: string, start: number, blocks: boolean): Chunk {
  const node = document.createElement("div") as unknown as Chunk;
  node._start = start;
  node._src = src;
  node._markKey = null;
  node._spans = [];
  node._synKey = "";
  node._line = 0;
  node._lines = 1;
  const body = src.replace(/\n$/, "");
  if (blocks)
    for (const line of body.split("\n")) {
      const div = document.createElement("div");
      div.textContent = line;
      node.appendChild(div);
    }
  else node.textContent = body;
  document.body.appendChild(node);
  return node;
}

test("backdropgeom: caretSpotAt цэгээс байрлал авна эсвэл null буцаана", () => {
  const doc = document as unknown as Record<string, unknown>;
  const saved = [doc.caretPositionFromPoint, doc.caretRangeFromPoint];
  const text = document.createTextNode("аб");
  doc.caretPositionFromPoint = () => ({ offsetNode: text, offset: 1 });
  assert.deepEqual(geom.caretSpotAt(1, 1), { node: text, offset: 1 });
  doc.caretPositionFromPoint = () => null;
  assert.equal(geom.caretSpotAt(1, 1), null);
  doc.caretPositionFromPoint = undefined;
  doc.caretRangeFromPoint = () => ({ startContainer: text, startOffset: 2 });
  assert.deepEqual(geom.caretSpotAt(1, 1), { node: text, offset: 2 });
  doc.caretRangeFromPoint = () => null;
  assert.equal(geom.caretSpotAt(1, 1), null);
  doc.caretRangeFromPoint = undefined;
  assert.equal(geom.caretSpotAt(1, 1), null);
  [doc.caretPositionFromPoint, doc.caretRangeFromPoint] = saved;
});

test("backdropgeom: caretRectAt мөр болон бүхэл блокоор тэгш өнцөгт өгнө", () => {
  for (const blocks of [true, false]) {
    const node = chunk("нэг\nхоёр\n", 10, blocks);
    const body = "нэг\nхоёр";
    assert.ok(geom.caretRectAt(node, body, 0, blocks));
    assert.ok(geom.caretRectAt(node, body, 5, blocks));
    assert.ok(geom.caretRectAt(node, body, 99, blocks));
    assert.equal(typeof geom.localOffsetAtY(node, body, -1, blocks), "number");
  }
});

test("backdropgeom: блок мөргүй үед мөрийн элементгүй байрлалыг даван туулна", () => {
  const node = chunk("а\nб\n", 0, true);
  node.replaceChildren();
  assert.ok(geom.caretRectAt(node, "а\nб", 2, true));
  assert.equal(geom.chunkRangeRect(node, 0, 1, true), null);
  assert.deepEqual(geom.chunkRangeRects(node, 0, 1, true), []);
});

test("backdropgeom: chunkRangeRect буруу мужид null буцаана", () => {
  const node = chunk("сайн байна\n", 5, false);
  assert.equal(geom.chunkRangeRect(node, 0, 3, false), null);
  assert.equal(geom.chunkRangeRect(node, 8, 8, false), null);
  const rect = geom.chunkRangeRect(node, 5, 9, false);
  assert.ok(rect === null || rect.width > 0);
  assert.deepEqual(geom.chunkRangeRects(node, 9, 9, false), []);
  assert.ok(Array.isArray(geom.chunkRangeRects(node, 0, 30, false)));
  const lines = chunk("нэг\nхоёр\n", 0, true);
  assert.ok(Array.isArray(geom.chunkRangeRects(lines, 1, 6, true)));
  const wide = geom.chunkRangeRect(lines, 1, 6, true);
  assert.ok(wide === null || wide.width > 0);
});

test("backdropgeom: localOffsetAtPoint цэгийн доорх тэмдэгтийн байрлалыг олно", () => {
  const flat = chunk("сайн байна\n", 0, false);
  const body = "сайн байна";
  const proto = window.Range.prototype;
  const saved = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: Range) {
    const index = this.startOffset;
    const row = Math.floor(index / 5);
    const left = (index % 5) * 10;
    return {
      left,
      right: left,
      top: row * 20,
      bottom: row * 20 + 20,
      width: 0,
      height: 20,
    } as DOMRect;
  };
  try {
    assert.equal(geom.localOffsetAtPoint(flat, body, 15, 10, false), 1);
    assert.equal(geom.localOffsetAtPoint(flat, body, 25, 30, false), 7);
    assert.equal(geom.localOffsetAtPoint(flat, body, -5, 10, false), 0);
    assert.equal(geom.localOffsetAtPoint(flat, body, 99, 30, false), 9);
    assert.equal(geom.localOffsetAtPoint(flat, body, 5, 99, false), 10);
  } finally {
    proto.getBoundingClientRect = saved;
  }
});
