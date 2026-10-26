import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><mark data-start="4"></mark>',
);
const { initMarkTap } = await import("../src/editor/marktap.ts");

test.after(() => dom.close());

const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
const mark = document.querySelector<HTMLElement>("mark")!;
mark.getClientRects = () =>
  [{ left: 10, right: 50, top: 0, bottom: 20 }] as unknown as DOMRectList;

const token = { word: "үгг", start: 4, end: 7 };
const shown: string[] = [];
const tap = initMarkTap({
  editor,
  backdrop: { marksAtY: () => [mark] } as never,
  tokens: () => [token],
  show: (t) => shown.push(t.word),
});

const press = (pointerType: string, x: number): PointerEvent => {
  const event = new PointerEvent("pointerdown", {
    pointerType,
    clientX: x,
    clientY: 10,
    cancelable: true,
  });
  editor.dispatchEvent(event);
  return event;
};

test("markTap: хуруугаар тэмдэг дээр дарвал санал харуулж click-ийг залгина", () => {
  const event = press("touch", 20);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(shown, ["үгг"]);
  assert.equal(tap.consumeClick(), true);
  assert.equal(tap.consumeClick(), false);
});

test("markTap: хулгана болон тэмдгээс гадуурх даралтыг үл тооно", () => {
  shown.length = 0;
  press("mouse", 20);
  press("touch", 80);
  assert.deepEqual(shown, []);
  assert.equal(tap.consumeClick(), false);
});
