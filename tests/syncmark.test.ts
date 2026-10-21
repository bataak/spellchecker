import { test } from "node:test";
import assert from "node:assert/strict";
import { markBox } from "../src/preview/syncmark.ts";
import { textLeft } from "../src/preview/pdftext.ts";

const page = { top: 100, left: 20, width: 600, height: 800 };

test("markBox: сумыг бичвэрийн зүүн захаас зүүн тийш мөрийн төвшинд байрлуулна", () => {
  const box = markBox(page, 0.5, 0.2);
  assert.ok(Math.abs(box.size - 8.8) < 1e-9);
  assert.ok(box.left + box.size < page.left + 0.2 * page.width);
  assert.ok(box.left > page.left);
  const middle = box.top + box.size / 2;
  assert.ok(middle < page.top + 0.5 * page.height);
  assert.ok(middle > page.top + 0.5 * page.height - 10);
});

test("markBox: зах тодорхойгүй эсвэл хэт зүүн бол хуудсан дотор үлдэнэ", () => {
  assert.ok(markBox(page, 0.3, null).left > page.left);
  assert.equal(markBox(page, 0.3, 0).left, page.left + 2);
});

test("textLeft: хуудасны бичвэрийн хамгийн зүүн захыг өргөний хэсгээр өгнө", () => {
  assert.equal(
    textLeft(
      [
        { text: "a", y: 1, left: 120, right: 400 },
        { text: "b", y: 2, left: 90, right: 300 },
        { text: "c", y: 3 },
      ],
      600,
    ),
    0.15,
  );
  assert.equal(textLeft([{ text: "a", y: 1 }], 600), null);
  assert.equal(textLeft([{ text: "a", y: 1, left: 10 }], 0), null);
});

test("markBox: жижиг хуудсан дээр сум 6px-ээс багасахгүй", () => {
  const box = markBox({ top: 0, left: 0, width: 150, height: 200 }, 0.5, 0.2);
  assert.equal(box.size, 6);
  assert.ok(Math.abs(box.top + box.size / 2 - (100 - 200 * 0.0045)) < 1e-9);
});
