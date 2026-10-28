import { test } from "node:test";
import assert from "node:assert/strict";
import { isHeic, jpegName } from "../src/files/heic.ts";

test("isHeic: төрөл эсвэл өргөтгөлөөр HEIC/HEIF-ийг танина", () => {
  const file = (name: string, type = "") => new File([""], name, { type });
  assert.equal(isHeic(file("IMG_1.HEIC")), true);
  assert.equal(isHeic(file("a.heif")), true);
  assert.equal(isHeic(file("зураг", "image/heic")), true);
  assert.equal(isHeic(file("зураг", "image/heif-sequence")), true);
  assert.equal(isHeic(file("a.jpg", "image/jpeg")), false);
  assert.equal(isHeic(file("heic.png", "image/png")), false);
});

test("jpegName: HEIC өргөтгөлийг .jpg болгоно", () => {
  assert.equal(jpegName("IMG_1234.HEIC"), "IMG_1234.jpg");
  assert.equal(jpegName("зураг.heif"), "зураг.jpg");
  assert.equal(jpegName("зураг"), "зураг.jpg");
});
