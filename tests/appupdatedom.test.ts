import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<button id="appReloadBtn" hidden></button><span id="appVersion"></span>',
);
const g = globalThis as Record<string, unknown>;
g.__APP_VERSION__ = "1.2.3";
g.__HUNSPELL_VERSION__ = "1.7";

const { initAppUpdate } = await import("../src/app/appupdate.ts");

test.after(() => dom.close());

test("appUpdate: хувилбарыг богино харуулж, дарахад дэлгэрэнгүй, толины хувилбарыг нэмнэ", () => {
  resetStorage();
  const update = initAppUpdate(() => {}, "http://localhost/assets/index-a.js");
  const label = document.querySelector<HTMLElement>("#appVersion")!;
  assert.equal(label.textContent, "v1.2.3");
  update.setDictVersion("2026.10");
  assert.equal(label.textContent, "v1.2.3");
  label.click();
  assert.equal(label.textContent, "v1.2.3 · hunspell 1.7 · mn_MN 2026.10");
  update.setDictVersion("2026.11");
  assert.equal(label.textContent, "v1.2.3 · hunspell 1.7 · mn_MN 2026.11");
  label.click();
  assert.equal(label.textContent, "v1.2.3");
});
