import { test } from "node:test";
import assert from "node:assert/strict";
import {
  covers,
  detailRect,
  pageIndexAt,
  rangeGap,
  revealShift,
  snapShift,
} from "../src/preview/pdfdetail.ts";

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

test("snapShift: бүхэл пиксел дээр шилжүүлэлтгүй", () => {
  assert.equal(snapShift(10, 20, 1), "");
  assert.equal(snapShift(10.25, 0, 2), "translate(0.25px, 0px)");
  assert.equal(snapShift(0, 0.375, 2), "translate(0px, 0.125px)");
});

test("pageIndexAt: шугам гаталсан эхний хуудсыг 1-ээс дугаарлана", () => {
  const bottoms = [100, 200, 300, 400];
  const at = (line: number) =>
    pageIndexAt(bottoms.length, (i) => bottoms[i]!, line);
  assert.equal(at(50), 1);
  assert.equal(at(100), 1);
  assert.equal(at(101), 2);
  assert.equal(at(399), 4);
  assert.equal(at(1000), 4);
  assert.equal(
    pageIndexAt(0, () => 0, 0),
    1,
  );
});

test("rangeGap: давхцахад 0, эс бөгөөс зай", () => {
  assert.equal(rangeGap(0, 100, 50, 60), 0);
  assert.equal(rangeGap(0, 100, 150, 200), 50);
  assert.equal(rangeGap(300, 400, 150, 200), 100);
  assert.equal(rangeGap(0, 100, 100, 100), 0);
});

test("revealShift: дунд хэсэгт байвал гүйлгэхгүй", () => {
  assert.equal(revealShift(500, 0, 1000), 0);
  assert.equal(revealShift(150, 0, 1000), 0);
  assert.equal(revealShift(100, 0, 1000), -250);
  assert.equal(revealShift(900, 0, 1000), 550);
});
