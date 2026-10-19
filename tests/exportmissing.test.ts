import test from "node:test";
import assert from "node:assert/strict";

import { missingImages } from "../src/export/exportformats.ts";
import { clearImages, putImage } from "../src/files/images.ts";

test("missingImages: өгөгдөлгүй дотоод зургийг давхардалгүй жагсаана", () => {
  clearImages();
  const text =
    "![](a.png) ба ![](a.png)\n\n- ![](b.jpg)\n\n![](https://x.mn/c.png)\n";
  assert.deepEqual(missingImages(text), ["a.png", "b.jpg"]);
  putImage("a.png", new Blob([new Uint8Array([1])], { type: "image/png" }));
  assert.deepEqual(missingImages(text), ["b.jpg"]);
  clearImages();
});
