import assert from "node:assert/strict";
import { test } from "node:test";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const { printPage } = await import("../src/export/printframe.ts");

test.after(() => dom.close());

test("printPage: өмнөх хэвлэх фреймийг сольж, нэгийг л үлдээнэ", () => {
  void printPage("<p>нэг</p>");
  void printPage("<style>p{}</style><p>хоёр</p>");
  const frames =
    document.querySelectorAll<HTMLIFrameElement>("iframe.print-frame");
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.srcdoc, "<p>хоёр</p>");
  assert.equal(frames[0]!.getAttribute("aria-hidden"), "true");
  frames[0]!.remove();
});
