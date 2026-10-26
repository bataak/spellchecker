import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("");
Object.assign(globalThis, { MutationObserver: dom.window.MutationObserver });
const { afterBoot, takeLayoutSnapshot } =
  await import("../src/ui/layoutsnapshot.ts");

test.after(() => dom.close());

test("layoutsnapshot: layout-ын data атрибут ба CSS хувьсагчийг хадгалж, theme-ийг алгасна", () => {
  const root = document.createElement("html");
  root.dataset.preview = "on";
  root.dataset.panel = "off";
  root.dataset.theme = "dark";
  root.style.setProperty("--editor-measure", "72");
  root.style.setProperty("--topbar-start", "40px");
  root.style.setProperty("color", "red");
  assert.deepEqual(takeLayoutSnapshot(root, 1600), {
    width: 1600,
    data: { preview: "on", panel: "off" },
    style: { "--editor-measure": "72", "--topbar-start": "40px" },
  });
});

test("measure: сэргээсэн layout-тай ачаалахад boot дуустал түлхүүр бүрийн сүүлийн өөрчлөлтийг л хийнэ", async () => {
  const root = document.documentElement;
  const runs: string[] = [];
  root.classList.add("booting", "layout-restored");
  afterBoot("layout", () => runs.push("layout:1"));
  afterBoot("metrics", () => runs.push("metrics:1"));
  afterBoot("layout", () => runs.push("layout:2"));
  await Promise.resolve();
  assert.equal(runs.length, 0);
  root.classList.remove("booting");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(runs, ["layout:2", "metrics:1"]);
  afterBoot("layout", () => runs.push("layout:3"));
  assert.deepEqual(runs, ["layout:2", "metrics:1", "layout:3"]);
});
