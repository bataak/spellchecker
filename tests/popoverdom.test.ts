import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const PAGE =
  '<textarea id="editor"></textarea><div id="backdrop"></div>' +
  '<div id="popover" hidden></div><div id="outside"></div>';
const dom = installDom(PAGE);
const { createBackdrop } = await import("../src/editor/backdrop.ts");
const { initPopover } = await import("../src/ui/popover.ts");
type DefTip = import("../src/define/deftip.ts").DefTip;

test.after(() => dom.close());

function setup() {
  document.body.innerHTML = PAGE;
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  const popover = document.querySelector<HTMLElement>("#popover")!;
  const backdrop = createBackdrop(document.querySelector("#backdrop")!);
  const text = "сайн байна алдаа";
  editor.value = text;
  const start = text.indexOf("алдаа");
  backdrop.render(text, [{ word: "алдаа", start, end: start + 5 }]);
  const calls: string[] = [];
  const defTip = new Proxy(
    {},
    {
      get: (_target, name) =>
        name === "keyboardShifting"
          ? () => false
          : () => calls.push(String(name)),
    },
  ) as unknown as DefTip;
  const pop = initPopover({
    editor,
    backdrop,
    popover,
    defTip,
    syncScroll: () => calls.push("syncScroll"),
  });
  return { editor, popover, pop, start, calls };
}

test("popover: алдаатай үг дээр нээгдэж, тооцоолж буйг харуулна", () => {
  const { popover, pop, start } = setup();
  pop.open(start);
  assert.equal(popover.hidden, false);
  assert.equal(pop.isOpenAt(start), true);
  assert.equal(pop.isOpenAt(0), false);
  assert.match(popover.textContent ?? "", /тооцоолж байна/);
  assert.ok(pop.list());
});

test("popover: тэмдэглэгээ алга бол байрлуулахдаа хаагдана", () => {
  const { popover, pop } = setup();
  pop.open(999);
  assert.equal(popover.hidden, true);
  assert.equal(pop.isOpenAt(999), false);
});

test("popover: их гүйлгэхэд хаагдаж, бага гүйлгэхэд үлдэнэ", () => {
  const { editor, popover, pop, start } = setup();
  pop.open(start);
  editor.scrollTop = 10;
  pop.followScroll();
  assert.equal(popover.hidden, false);
  Object.defineProperty(editor, "scrollTop", { value: 40, configurable: true });
  pop.followScroll();
  assert.equal(popover.hidden, true);
});

test("popover: гадна дарахад хаагдаж, дотор дарахад үлдэнэ", () => {
  const { popover, pop, start } = setup();
  pop.open(start);
  popover.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  assert.equal(popover.hidden, false);
  document
    .querySelector("#outside")!
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  assert.equal(popover.hidden, true);
});
