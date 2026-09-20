import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coveredHeight,
  firstOpaque,
  isKeyboardOpen,
  nextBaseline,
  placeAboveKeyboard,
  revealDelta,
} from "../src/kbtoolbar.ts";

const page = { top: 0, left: 0 };

test("хуудас гүйлгээгүй үед гарын дээд ирмэгт байрлуулна", () => {
  assert.deepEqual(
    placeAboveKeyboard(
      { pageTop: 0, pageLeft: 0, width: 390, height: 477 },
      36,
      page,
    ),
    { top: 441, left: 0, width: 390 },
  );
});

test("iOS хуудсыг гүйлгэсэн үед баримтын координатаар байрлуулна", () => {
  assert.deepEqual(
    placeAboveKeyboard(
      { pageTop: 122, pageLeft: 0, width: 390, height: 477 },
      36,
      page,
    ),
    { top: 563, left: 0, width: 390 },
  );
});

test("байрлуулах эх элементийн шилжилтийг хасна", () => {
  assert.deepEqual(
    placeAboveKeyboard(
      { pageTop: 122, pageLeft: 0, width: 390, height: 477 },
      36,
      { top: 200, left: 16 },
    ),
    { top: 363, left: -16, width: 390 },
  );
});

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

test("тунгалаг биш эхний арын өнгийг сонгоно", () => {
  assert.equal(
    firstOpaque(["rgba(0, 0, 0, 0)", "transparent", "rgb(30, 27, 22)"]),
    "rgb(30, 27, 22)",
  );
  assert.equal(firstOpaque(["rgba(0, 0, 0, 0)", ""]), null);
});

test("курсор цэсийн ард орсон бол гүйлгэх зайг тооцно", () => {
  assert.equal(revealDelta(400, 441), 0);
  assert.equal(revealDelta(433, 441), 0);
  assert.equal(revealDelta(460, 441), 27);
  assert.equal(revealDelta(460.4, 441, 0), 20);
});

test("гар болон цэсний халхалсан өндрийг тооцно", () => {
  assert.equal(coveredHeight(768, 477, 36), 327);
  assert.equal(coveredHeight(768, 768, 36), 36);
  assert.equal(coveredHeight(768, 800, 0), 0);
});
