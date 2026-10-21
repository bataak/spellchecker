import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><div id="popover" hidden></div><span class="w">ном</span><span class="sg-dot" tabindex="0"></span>',
);
const win = dom.window as unknown as Record<string, unknown>;
let coarse = false;
win.matchMedia = (query: string) => ({
  matches: query === "(pointer: coarse)" && coarse,
});
const g = globalThis as Record<string, unknown>;
g.performance = performance;

const { initDefTip } = await import("../src/define/deftip.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const entry = (headword: string) => ({
  headword,
  text: headword + " гэдэг нь",
  pos: [],
});

function setup() {
  resetStorage();
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  editor.getBoundingClientRect = () => new DOMRect(0, 0, 600, 400);
  const held: string[] = [];
  const panels: string[] = [];
  let hidden = 0;
  const tip = initDefTip({
    editor,
    popover: document.querySelector<HTMLElement>("#popover")!,
    define: async (word) => ({
      dicts: 1,
      source: "",
      entries: word === "алга" ? [] : [entry(word)],
    }),
    showPanel: (word) => panels.push(word),
    hidePopover: () => hidden++,
    holdStatus: (html) => held.push(html),
    dock: {
      body: () => null,
      zoneAt: () => null,
      hint: () => {},
      dock: () => {},
      sync: () => {},
      onDragOut: () => {},
      onShow: () => {},
      addControl: () => {},
      clear: () => {},
    },
    backdrop: {
      rangeRectAt: () => new DOMRect(20, 30, 40, 18),
    } as never,
  });
  const box = () =>
    [...document.querySelectorAll<HTMLElement>(".def-tip")].at(-1) ?? null;
  return { tip, held, panels, box, hidden: () => hidden };
}

test("defTip: үгийн тайлбарыг харуулж, нуухад хаагдана", async () => {
  const { tip, box, hidden } = setup();
  await tip.showWordDefinition({ word: "ном", start: 0, end: 3 });
  assert.equal(box()?.hidden, false);
  assert.match(box()!.textContent!, /ном гэдэг нь/);
  assert.equal(tip.wordTipOpen(), true);
  assert.equal(hidden(), 1);
  tip.hideWordTip();
  assert.equal(box()!.hidden, true);
  assert.equal(tip.wordTipOpen(), false);
});

test("defTip: тайлбаргүй үгэнд статус мөрөнд мэдэгдэнэ, хулганаар бол чимээгүй", async () => {
  const { tip, held, box } = setup();
  await tip.showWordDefinition({ word: "алга", start: 0, end: 4 });
  assert.deepEqual(held, ["Тайлбар олдсонгүй: алга"]);
  await tip.showWordDefinition({ word: "алга", start: 0, end: 4 }, 25);
  assert.equal(held.length, 1);
  assert.equal(box()?.hidden ?? true, true);
});

test("defTip: цэг дээр хулгана очиход popover нээлттэй үед тайлбар гаргаж, гарахад хаана", async () => {
  const { tip, box } = setup();
  const popover = document.querySelector<HTMLElement>("#popover")!;
  popover.hidden = false;
  const dot = document.querySelector<HTMLElement>(".sg-dot")!;
  tip.bindDot(dot);
  dot.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
  await wait();
  assert.equal(box()!.hidden, false);
  assert.equal(dot.getAttribute("aria-expanded"), "true");
  dot.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
  await wait(300);
  assert.equal(box()!.hidden, true);
  assert.equal(dot.getAttribute("aria-expanded"), "false");
  popover.hidden = true;
});

test("defTip: утсан дээр цэг дарахад тайлбарын самбар нээнэ", () => {
  const { tip, panels } = setup();
  coarse = true;
  const dot = document.querySelector<HTMLElement>(".sg-dot")!;
  tip.bindDot(dot);
  dot.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  coarse = false;
  assert.deepEqual(panels, ["ном"]);
});
