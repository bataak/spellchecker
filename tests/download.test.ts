import "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
const {
  FIREFOX_SAVE_HINT,
  asksWhereToSave,
  downloadBlob,
  initDownloadHint,
  onDownload,
} = await import("../src/files/download.ts");

test.after(() => dom.close());

const FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

test("asksWhereToSave: зөвхөн picker-гүй Firefox асуудаггүй", () => {
  assert.equal(asksWhereToSave(FIREFOX, false), false);
  assert.equal(asksWhereToSave(FIREFOX, true), true);
  assert.equal(asksWhereToSave(CHROME, false), true);
  const android =
    "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0";
  assert.equal(asksWhereToSave(android, false), true);
});

test("downloadBlob: холбоосоор татаж, сонсогчдод мэдэгдэнэ", () => {
  const clicked: string[] = [];
  const original = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  };
  let heard = 0;
  const stop = onDownload(() => (heard += 1));
  downloadBlob(new Blob(["а"]), "а.txt");
  stop();
  downloadBlob(new Blob(["б"]), "б.txt");
  dom.window.HTMLAnchorElement.prototype.click = original;
  assert.deepEqual(clicked, ["а.txt", "б.txt"]);
  assert.equal(heard, 1);
  assert.equal(document.querySelector("a"), null);
});

test("initDownloadHint: Firefox дээр зөвлөмжийг нэг л удаа харуулна", () => {
  Object.defineProperty(navigator, "userAgent", {
    value: FIREFOX,
    configurable: true,
  });
  const shown: string[] = [];
  initDownloadHint((html) => shown.push(html));
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  downloadBlob(new Blob(["а"]), "а.txt");
  downloadBlob(new Blob(["б"]), "б.txt");
  assert.deepEqual(shown, [FIREFOX_SAVE_HINT]);
});
