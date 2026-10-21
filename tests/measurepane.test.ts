import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<main><div class="editor-wrap"><button class="decode-btn"></button>' +
    '<textarea id="ed"></textarea></div></main>',
);
const observed: (() => void)[] = [];
class FakeResizeObserver {
  constructor(run: () => void) {
    observed.push(run);
  }
  observe(): void {}
  disconnect(): void {}
}
Object.assign(globalThis, { ResizeObserver: FakeResizeObserver });
Object.assign(dom.window, {
  ResizeObserver: FakeResizeObserver,
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
for (const [name, value] of [
  ["clientWidth", 2400],
  ["clientHeight", 1000],
] as const)
  Object.defineProperty(document.documentElement, name, { value });

const { initMeasureControl } = await import("../src/ui/measure.ts");
const { createPdfPane } = await import("../src/preview/pdfpane.ts");

test.after(() => dom.close());

test("measure: байрлалын цэсийг нээж хааж, горим солиход дахин тооцоолно", () => {
  resetStorage();
  const wrap = document.querySelector<HTMLElement>(".editor-wrap")!;
  Object.defineProperty(wrap, "clientWidth", { value: 2400 });
  const area = document.querySelector<HTMLElement>("#ed")!;
  const layouts: unknown[] = [];
  const control = initMeasureControl(wrap, area, (l) => layouts.push(l));
  const btn = wrap.querySelector<HTMLButtonElement>(".measure-btn")!;
  const menu = wrap.querySelector<HTMLElement>(".measure-menu")!;
  assert.ok(wrap.querySelector(".editor-tools .decode-btn"));
  assert.ok(layouts.length > 0);
  btn.click();
  assert.equal(menu.hidden, false);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(menu.hidden, true);
  btn.click();
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  assert.equal(menu.hidden, true);
  const before = layouts.length;
  control.setPreviewMode(true);
  control.setPreviewMode(true);
  control.setPreviewMode(true, true);
  control.setPreviewBlocked(true);
  control.setPreviewBlocked(true);
  observed.at(-1)!();
  assert.equal(layouts.length, before + 4);
  assert.equal(typeof control.layout().preview, "boolean");
  assert.equal(typeof control.dockRoom("left", true), "boolean");
  control.refresh();
  control.destroy();
  assert.equal(wrap.querySelector(".editor-tools"), null);
  assert.ok(wrap.querySelector(":scope > .decode-btn"));
});

function pane() {
  resetStorage();
  const panel = document.createElement("section");
  const body = document.createElement("div");
  const zooms: number[] = [];
  const head = {
    head: document.createElement("div"),
    showZoom: (zoom: number) => zooms.push(zoom),
    showPage: () => {},
    closePageInput: () => zooms.push(-1),
  };
  const view = createPdfPane(panel, body, () => head as never);
  return { panel, body, zooms, view };
}

test("pdfpane: томруулалтыг алхмаар өөрчилж хадгална, хуудасгүй үед аюулгүй", () => {
  const { zooms, view } = pane();
  view.syncZoom();
  view.zoom("in");
  assert.equal(localStorage.getItem("pdfZoom"), String(zooms[1]));
  view.zoom("out");
  view.zoom("reset");
  assert.equal(zooms[0], 1);
  assert.ok(zooms[1]! > 1);
  assert.equal(zooms.at(-1), 1);
  view.goTo(3);
  assert.equal(view.view(), null);
  assert.equal(view.shown(), null);
  view.drop();
  assert.equal(zooms.at(-1), -1);
});

test("pdfpane: дүрслэхээс өмнө татгалзвал PDF-ийг харуулахгүй", async () => {
  const { view, panel } = pane();
  const shown = await view.showBytes(new Uint8Array([1, 2, 3]), () => false);
  assert.equal(shown, false);
  assert.equal(panel.classList.contains("has-pages"), false);
});
