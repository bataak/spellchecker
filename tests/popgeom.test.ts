import { test } from "node:test";
import assert from "node:assert/strict";
import { fitVertically, MIN_POPOVER_H } from "../src/ui/popgeom.ts";

const view = { top: 0, left: 0, width: 400, bottom: 800 };

test("fitVertically: доор зай ихтэй бол үгийн доор, багтвал хязгаарлахгүй", () => {
  assert.deepEqual(fitVertically({ top: 100, bottom: 120 }, view, 200, 6), {
    top: 126,
    height: 200,
    capped: false,
  });
});

test("fitVertically: дээр зай ихтэй бол үгийн дээр, багтахгүй бол өндрийг хязгаарлана", () => {
  const fit = fitVertically({ top: 500, bottom: 520 }, view, 900, 6);
  assert.equal(fit.height, 500 - 12);
  assert.equal(fit.capped, true);
  assert.equal(fit.top, 6);
});

test("fitVertically: зай бага ч доод өндрөөс багасгахгүй, харагдах хэсэгт шахна", () => {
  const fit = fitVertically({ top: 20, bottom: 780 }, view, 400, 6);
  assert.equal(fit.height, MIN_POPOVER_H);
  assert.equal(fit.top, 800 - MIN_POPOVER_H - 6);
});
