import { test } from "node:test";
import assert from "node:assert/strict";
import { clampOffset, parseOffset, placeBar } from "../src/editor/finddrag.ts";

test("parseOffset хадгалсан байрлалыг уншина", () => {
  assert.deepEqual(parseOffset("-120,48"), { x: -120, y: 48 });
  assert.equal(parseOffset(null), null);
  assert.equal(parseOffset(""), null);
  assert.equal(parseOffset("a,3"), null);
});

test("clampOffset цонхыг редакторын хүрээнд барина", () => {
  const room = { left: 0, top: 0, right: 800, bottom: 600 };
  const natural = { left: 500, top: 14, right: 786, bottom: 90 };
  assert.deepEqual(clampOffset({ x: -100, y: 50 }, natural, room), {
    x: -100,
    y: 50,
  });
  assert.deepEqual(clampOffset({ x: -900, y: 900 }, natural, room), {
    x: -500,
    y: 510,
  });
  assert.deepEqual(clampOffset({ x: 300, y: -40 }, natural, room), {
    x: 14,
    y: -14,
  });
});

test("clampOffset багтахгүй үед зүүн дээд хязгаарыг сонгоно", () => {
  const room = { left: 0, top: 0, right: 200, bottom: 50 };
  const natural = { left: 10, top: 10, right: 310, bottom: 90 };
  assert.deepEqual(clampOffset({ x: 40, y: 40 }, natural, room), {
    x: -10,
    y: -10,
  });
});

test("placeBar баруун дээд булангаас байрлуулж, дэлгэцэнд багтаана", () => {
  const room = { left: 0, top: 0, right: 1000, bottom: 700 };
  assert.deepEqual(placeBar({ right: 900, top: 20 }, 400, 80, room), {
    x: 500,
    y: 20,
  });
  assert.deepEqual(placeBar({ right: 1300, top: 680 }, 400, 80, room), {
    x: 600,
    y: 620,
  });
  assert.deepEqual(placeBar({ right: 100, top: -50 }, 400, 80, room), {
    x: 0,
    y: 0,
  });
});
