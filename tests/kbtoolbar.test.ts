import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeyboardOpen, nextBaseline, revealDelta } from "../src/kbtoolbar.ts";

test("хаягийн мөрийн өөрчлөлтийг гар гэж андуурахгүй", () => {
  const baseline = { width: 390, height: 844 };
  assert.equal(isKeyboardOpen(baseline, { height: 790, offsetTop: 0 }), false);
  assert.equal(isKeyboardOpen(baseline, { height: 508, offsetTop: 0 }), true);
});

test("PWA-д layout viewport хамт жижгэрсэн ч гарыг таньна", () => {
  let baseline = nextBaseline(null, 390, 844);
  baseline = nextBaseline(baseline, 390, 646);
  assert.deepEqual(baseline, { width: 390, height: 844 });
  assert.equal(isKeyboardOpen(baseline, { height: 477, offsetTop: 122 }), true);
});

test("дэлгэц эргэхэд суурь өндрийг шинээр тогтооно", () => {
  let baseline = nextBaseline(null, 390, 844);
  baseline = nextBaseline(baseline, 844, 390);
  assert.deepEqual(baseline, { width: 844, height: 390 });
});

test("курсор засварлагчийн харагдах хэсгээс доош байвал гүйлгэх зайг тооцно", () => {
  assert.equal(revealDelta(400, 441), 0);
  assert.equal(revealDelta(433, 441), 0);
  assert.equal(revealDelta(460, 441), 27);
});
