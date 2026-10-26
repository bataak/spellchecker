import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  createRoomColors,
  pickColor,
  pickName,
  PRUNE_MS,
  STALE_MS,
} from "../src/collab/roomcolors.ts";
import { NAMES } from "../src/collab/profile.ts";

const claim = (c: number, a: number) => ({ c, a });

test("pickColor бусдын аваагүй өнгийг сонгож, эрт авсан нь өнгөө хадгална", () => {
  assert.equal(pickColor(new Map(), "me", 3), 3);
  assert.equal(pickColor(new Map([["x", claim(3, 1)]]), "me", 3), 6);
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
    5,
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
    6,
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

test("удаан ирээгүй гишүүний өнгө чөлөөлөгдөж, маш хуучин бүртгэл устна", () => {
  const doc = new Y.Doc();
  const map = doc.getMap<unknown>("colors");
  const now = Date.now();
  map.set("old", { c: 2, a: now - PRUNE_MS - 1000 });
  map.set("away", { c: 1, a: now - STALE_MS - 1000 });
  map.set("here", { c: 0, a: now - 1000, s: now - 1000 });
  const me = createRoomColors(doc, "me", () => ({ name: "Би", color: 3 }));
  assert.equal(map.has("old"), false);
  assert.equal(map.has("away"), true);
  assert.equal(me.profile().color, 1);
  assert.equal(me.colorOf("away"), 1);
  me.forget("here");
  assert.equal(map.has("here"), false);
  me.forget("me");
  assert.equal(map.has("me"), true);
  me.destroy();
});

test("өнгөний бүртгэлийн сүүлд харагдсан огноог өдөрт нэг удаа шинэчилнэ", () => {
  const doc = new Y.Doc();
  const map = doc.getMap<unknown>("colors");
  const now = Date.now();
  map.set("me", { c: 4, a: now - 10 * 86_400_000 });
  const me = createRoomColors(doc, "me", () => ({ name: "Би", color: 1 }));
  const claim = map.get("me") as { c: number; a: number; s: number };
  assert.equal(claim.c, 4);
  assert.equal(claim.a, now - 10 * 86_400_000);
  assert.ok(claim.s >= now);
  me.destroy();
});

test("автомат нэр өрөөнд давхардахгүй, өөрөө өгсөн нэр хэвээр үлдэнэ", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update));
  const one = createRoomColors(a, "aaa", () => ({
    name: NAMES[0]!,
    color: 0,
    auto: 0,
  }));
  const two = createRoomColors(b, "bbb", () => ({
    name: NAMES[0]!,
    color: 0,
    auto: 0,
  }));
  assert.equal(one.profile().name, NAMES[0]);
  assert.equal(two.profile().name, NAMES[1]);
  const c = new Y.Doc();
  Y.applyUpdate(c, Y.encodeStateAsUpdate(a));
  let custom = "Бат";
  const three = createRoomColors(c, "ccc", () =>
    custom
      ? { name: custom, color: 0 }
      : { name: NAMES[0]!, color: 0, auto: 0 },
  );
  assert.equal(three.profile().name, "Бат");
  assert.equal(c.getMap("names").has("ccc"), false);
  custom = "";
  c.getMap("names").set("zzz", { c: 5, a: Date.now() - 10 });
  assert.equal(three.profile().name, NAMES[2]);
  one.destroy();
  two.destroy();
  three.destroy();
});

test("pickName хамгийн цөөн хүнд оногдсон нэрийг хүссэн нэрээс эхэлж сонгоно", () => {
  const claim = (c: number, a: number) => ({ c, a });
  assert.equal(pickName(new Map(), "me", 7), 7);
  assert.equal(pickName(new Map([["x", claim(7, 1)]]), "me", 7), 8);
  assert.equal(
    pickName(
      new Map([["x", claim(NAMES.length - 1, 1)]]),
      "me",
      NAMES.length - 1,
    ),
    0,
  );
  assert.equal(NAMES.length, 26);
  assert.equal(new Set(NAMES).size, NAMES.length);
});
