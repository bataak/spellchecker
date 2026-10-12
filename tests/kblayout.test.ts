import { test } from "node:test";
import assert from "node:assert/strict";
import { mapKey, otherLayout } from "../src/kblayout.ts";

test("монгол layout стандарт байрлалаар үсэг гаргана", () => {
  const word = ["KeyG", "KeyD", "KeyO", "KeyF"].map((code) =>
    mapKey("mn", code, false, false),
  );
  assert.deepEqual(word, ["а", "б", "ү", "ө"]);
  assert.equal(mapKey("mn", "KeyY", true, false), "Н");
  assert.equal(mapKey("mn", "Digit4", false, false), "4");
  assert.equal(mapKey("mn", "Digit4", true, false), "₮");
  assert.equal(mapKey("mn", "Digit1", true, false), "№");
  assert.equal(mapKey("mn", "Minus", false, false), "е");
});

test("Caps Lock зөвхөн үсэгт нөлөөлнө", () => {
  assert.equal(mapKey("mn", "KeyQ", false, true), "Ф");
  assert.equal(mapKey("mn", "KeyQ", true, true), "ф");
  assert.equal(mapKey("mn", "Digit6", false, true), "6");
  assert.equal(mapKey("en", "KeyQ", false, true), "Q");
});

test("англи layout QWERTY байрлалтай", () => {
  assert.equal(mapKey("en", "KeyF", false, false), "f");
  assert.equal(mapKey("en", "Digit2", true, false), "@");
  assert.equal(mapKey("en", "Quote", true, false), '"');
});

test("танигдаагүй товч хувиргагдахгүй", () => {
  assert.equal(mapKey("mn", "Enter", false, false), null);
  assert.equal(mapKey("mn", "Space", false, false), null);
});

test("системийн эсрэг layout руу шилжинэ", () => {
  assert.equal(otherLayout("en"), "mn");
  assert.equal(otherLayout("mn"), "en");
  assert.equal(otherLayout(null), "mn");
});
