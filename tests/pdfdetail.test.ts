import { test } from "node:test";
import assert from "node:assert/strict";
import { covers, detailRect } from "../src/preview/pdfdetail.ts";

const page = { left: -500, top: -1000, width: 2000, height: 2828 };
const view = { left: 0, top: 0, width: 350, height: 650 };

test("detailRect дэлгэцэд харагдах хэсгийг хуудасны координатаар буцаана", () => {
  assert.deepEqual(detailRect(page, view, 0, 2), {
    x: 500,
    y: 1000,
    w: 350,
    h: 650,
  });
  assert.deepEqual(detailRect(page, view, 100, 2), {
    x: 400,
    y: 900,
    w: 550,
    h: 850,
  });
});

test("detailRect хуудасны ирмэгээр тайрч, төхөөрөмжийн пикселд тааруулна", () => {
  const near = { left: 10.3, top: 20.7, width: 300, height: 400 };
  const rect = detailRect(near, view, 50, 2)!;
  assert.deepEqual(rect, { x: 0, y: 0, w: 300, h: 400 });
  const half = detailRect({ ...near, left: 0.25 }, view, 0, 2)!;
  assert.equal(half.x * 2, Math.floor(half.x * 2));
  assert.equal(detailRect({ ...page, top: 700 }, view, 0, 2), null);
});

test("covers хадгалсан хэсэг хэрэгтэй хэсгийг бүрэн агуулах эсэхийг шалгана", () => {
  const have = { x: 400, y: 900, w: 550, h: 850 };
  assert.equal(covers(have, { x: 500, y: 1000, w: 350, h: 650 }), true);
  assert.equal(covers(have, { x: 500, y: 1200, w: 350, h: 650 }), false);
});
