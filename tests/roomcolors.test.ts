import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createRoomColors, pickColor } from "../src/collab/roomcolors.ts";

const claim = (c: number, a: number) => ({ c, a });

test("pickColor бусдын аваагүй өнгийг сонгож, эрт авсан нь өнгөө хадгална", () => {
  assert.equal(pickColor(new Map(), "me", 3), 3);
  assert.equal(pickColor(new Map([["x", claim(3, 1)]]), "me", 3), 2);
  assert.equal(pickColor(new Map([["x", claim(0, 1)]]), "me", 0), 1);
  assert.equal(
    pickColor(
      new Map([
        ["x", claim(0, 1)],
        ["y", claim(1, 2)],
      ]),
      "me",
      0,
    ),
    6,
  );
  assert.equal(
    pickColor(
      new Map([
        ["x", claim(3, 1)],
        ["me", claim(3, 2)],
      ]),
      "me",
      3,
    ),
    2,
  );
  assert.equal(
    pickColor(
      new Map([
        ["x", claim(3, 5)],
        ["me", claim(3, 2)],
      ]),
      "me",
      3,
    ),
    3,
  );
  const full = new Map(
    Array.from({ length: 8 }, (_, i) => [String(i), claim(i, i)] as const),
  );
  assert.equal(pickColor(full, "me", 6), 6);
});

test("зэрэг нэгдсэн хоёр хамтрагч өөр өнгөтэй болно", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const one = createRoomColors(a, "aaa", () => ({ name: "А", color: 2 }));
  const two = createRoomColors(b, "bbb", () => ({ name: "Б", color: 2 }));
  assert.equal(one.profile().color, 2);
  assert.equal(two.profile().color, 2);
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update));
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  assert.notEqual(one.profile().color, two.profile().color);
  assert.equal(one.profile().name, "А");
  const c = new Y.Doc();
  Y.applyUpdate(c, Y.encodeStateAsUpdate(a));
  const three = createRoomColors(c, "ccc", () => ({ name: "В", color: 2 }));
  assert.ok(
    ![one.profile().color, two.profile().color].includes(three.profile().color),
  );
  one.destroy();
  two.destroy();
  three.destroy();
});
