import { test } from "node:test";
import assert from "node:assert/strict";
import { keepAnchor, pointOnPage } from "../src/preview/pdfzoom.ts";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function box(rect: Rect): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }),
  } as unknown as HTMLElement;
}

test("pointOnPage: цэгийг хуудасны харьцангуй координат болгоно", () => {
  const pages = [
    box({ left: 0, top: 0, width: 100, height: 200 }),
    box({ left: 0, top: 210, width: 100, height: 200 }),
  ];
  assert.deepEqual(pointOnPage(pages, 50, 310), { page: 2, x: 0.5, y: 0.5 });
  assert.equal(pointOnPage(pages, 150, 100), null);
  assert.equal(pointOnPage(pages, 50, 205), null);
});

test("keepAnchor: томруулсны дараа хуруун доорх цэгийг байранд нь үлдээнэ", () => {
  const rect = { left: 0, top: 0, width: 100, height: 200 };
  const page = box(rect);
  const host = {
    scrollLeft: 0,
    scrollTop: 0,
    clientLeft: 0,
    clientTop: 0,
    clientWidth: 100,
    clientHeight: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLElement;
  keepAnchor(host, [page], { x: 50, y: 50 }, () => {
    rect.width = 200;
    rect.height = 400;
  });
  assert.equal(host.scrollLeft, 50);
  assert.equal(host.scrollTop, 50);
});
