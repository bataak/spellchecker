import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom("<textarea></textarea>");
const { initTexItems } = await import("../src/tex/texitems.ts");

test.after(() => dom.close());

const editor = document.querySelector("textarea")!;
let active = true;
initTexItems({ editor, active: () => active });

const press = (init: KeyboardEventInit): boolean => {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    cancelable: true,
    ...init,
  });
  editor.dispatchEvent(event);
  return event.defaultPrevented;
};

const at = (text: string): void => {
  editor.value = text;
  editor.setSelectionRange(text.length, text.length);
};

test("texitems: Alt+Enter жагсаалтад шинэ \\item нэмж курсорыг араас нь тавина", () => {
  at("\\begin{itemize}\n  \\item xxx");
  assert.equal(press({ altKey: true }), true);
  assert.equal(editor.value, "\\begin{itemize}\n  \\item xxx\n  \\item ");
  assert.equal(editor.selectionStart, editor.value.length);
});

test("texitems: бусад товч, жагсаалтын гадна, идэвхгүй үед оролцохгүй", () => {
  at("\\begin{itemize}\n\\item a");
  assert.equal(press({}), false);
  assert.equal(press({ altKey: true, ctrlKey: true }), false);
  active = false;
  assert.equal(press({ altKey: true }), false);
  active = true;
  at("Энгийн");
  assert.equal(press({ altKey: true }), false);
  assert.equal(editor.value, "Энгийн");
});
