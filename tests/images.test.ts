import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearImages,
  imageBlob,
  imagePath,
  imageUrl,
  onImagesChange,
  putImage,
} from "../src/images.ts";

test("imagePath: хоосон зай, хаалтыг кодлоно", () => {
  assert.equal(imagePath("үнэмлэх (1).jpg"), "үнэмлэх%20%281%29.jpg");
});

test("гадаад хаягийг шууд ашиглана", () => {
  assert.equal(imageUrl("https://a.mn/x.png"), "https://a.mn/x.png");
  assert.equal(imageUrl("x.png"), null);
});

test("хадгалсан зургийг цэвэрлэхэд мэдэгдэнэ", () => {
  let calls = 0;
  const off = onImagesChange(() => {
    calls += 1;
  });
  const blob = new Blob(["x"], { type: "image/png" });
  putImage("x.png", blob);
  assert.match(imageUrl("x.png") ?? "", /^blob:/);
  assert.equal(imageBlob("x.png"), blob);
  clearImages();
  assert.equal(imageUrl("x.png"), null);
  clearImages();
  assert.equal(calls, 2);
  off();
});
