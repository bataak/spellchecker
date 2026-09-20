import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstOpaque,
  isKeyboardOpen,
  keyboardInset,
  nextBaseline,
} from "../src/kbtoolbar.ts";

test("гарын өндрийг visualViewport-оос тооцно", () => {
  assert.equal(keyboardInset(844, { height: 844, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 0 }), 336);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 120 }), 216);
  assert.equal(keyboardInset(844, { height: 900, offsetTop: 0 }), 0);
  assert.equal(keyboardInset(844, null), 0);
});

test("хаягийн мөрийн өөрчлөлтийг гар гэж андуурахгүй", () => {
  const baseline = { width: 390, height: 844 };
  assert.equal(isKeyboardOpen(baseline, { height: 790, offsetTop: 0 }), false);
  assert.equal(isKeyboardOpen(baseline, { height: 508, offsetTop: 0 }), true);
});

test("PWA-д layout viewport хамт жижгэрсэн ч гарыг таньна", () => {
  let baseline = nextBaseline(null, 390, 844);
  baseline = nextBaseline(baseline, 390, 508);
  assert.deepEqual(baseline, { width: 390, height: 844 });
  assert.equal(isKeyboardOpen(baseline, { height: 508, offsetTop: 0 }), true);
  assert.equal(keyboardInset(508, { height: 508, offsetTop: 0 }), 0);
});

test("дэлгэц эргэхэд суурь өндрийг шинээр тогтооно", () => {
  let baseline = nextBaseline(null, 390, 844);
  baseline = nextBaseline(baseline, 844, 390);
  assert.deepEqual(baseline, { width: 844, height: 390 });
});

test("тунгалаг биш эхний арын өнгийг сонгоно", () => {
  assert.equal(
    firstOpaque(["rgba(0, 0, 0, 0)", "transparent", "rgb(30, 27, 22)"]),
    "rgb(30, 27, 22)",
  );
  assert.equal(firstOpaque(["rgba(30, 27, 22, 0.9)"]), "rgba(30, 27, 22, 0.9)");
  assert.equal(firstOpaque(["rgba(0, 0, 0, 0)", ""]), null);
});
