import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowRemoteImages,
  clearImages,
  freeImagePath,
  imageBlob,
  imagePath,
  imageUrl,
  isBlockedRemote,
  onImagesChange,
  putImage,
} from "../src/images.ts";

test("imagePath: хоосон зай, хаалтыг кодлоно", () => {
  assert.equal(imagePath("үнэмлэх (1).jpg"), "үнэмлэх%20%281%29.jpg");
});

test("гадаад хаягийг зөвшөөрсний дараа л ашиглана", () => {
  assert.equal(isBlockedRemote("https://a.mn/x.png"), true);
  assert.equal(imageUrl("https://a.mn/x.png"), null);
  allowRemoteImages(["https://a.mn/x.png"]);
  assert.equal(isBlockedRemote("https://a.mn/x.png"), false);
  assert.equal(imageUrl("https://a.mn/x.png"), "https://a.mn/x.png");
  assert.equal(isBlockedRemote("https://a.mn/y.png"), true);
  assert.equal(isBlockedRemote("data:image/png;base64,AA"), false);
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

test("ижил нэртэй өөр зураг өмнөхийг дарахгүй, шинэ нэр авна", () => {
  clearImages();
  const first = new File(["IMAGE A"], "photo.png", { type: "image/png", lastModified: 1 });
  const second = new File(["IMAGE BB"], "photo.png", { type: "image/png", lastModified: 2 });
  const a = freeImagePath(first.name, first);
  putImage(a, first);
  const b = freeImagePath(second.name, second);
  putImage(b, second);
  assert.equal(a, "photo.png");
  assert.equal(b, "photo-2.png");
  assert.equal(imageBlob(a), first);
  assert.equal(freeImagePath(first.name, first), "photo.png");
  clearImages();
});
