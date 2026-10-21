import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea>');
const { initTexComplete } = await import("../src/tex/texcomplete.ts");

test.after(() => dom.close());

const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
const images: number[] = [];
initTexComplete({
  editor,
  active: () => true,
  rectAt: () => new DOMRect(10, 10, 20, 16),
  onImage: () => images.push(1),
});
const list = document.querySelector<HTMLElement>(".tex-complete")!;

function type(text: string): void {
  editor.value = text;
  editor.setSelectionRange(text.length, text.length);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  editor.dispatchEvent(event);
  return event;
}

function before(inputType: string, data: string | null = null): InputEvent {
  const event = new InputEvent("beforeinput", {
    inputType,
    data,
    bubbles: true,
    cancelable: true,
  });
  editor.dispatchEvent(event);
  return event;
}

test("texComplete: \\sec бичихэд жагсаалт гарч, Enter-ээр snippet оруулж, Tab-аар хаалтаас гарна", () => {
  type("\\subsec");
  assert.equal(list.hidden, false);
  const first = list.querySelector("li .tc-name")!.textContent;
  assert.equal(first, "\\subsection");
  key("ArrowDown");
  key("ArrowUp");
  assert.equal(
    editor.getAttribute("aria-activedescendant"),
    "texCompleteList-0",
  );
  key("Enter");
  assert.equal(list.hidden, true);
  assert.equal(editor.value, "\\subsection{}");
  assert.equal(editor.selectionStart, "\\subsection{".length);
  const tab = key("Tab");
  assert.equal(tab.defaultPrevented, true);
  assert.equal(editor.selectionStart, editor.value.length);
});

test("texComplete: Escape хаагаад тэр байрлалд дахин нээхгүй", () => {
  type("\\subsec");
  assert.equal(list.hidden, false);
  key("Escape");
  assert.equal(list.hidden, true);
  type("\\subsect");
  assert.equal(list.hidden, true);
  type("text \\subsec");
  assert.equal(list.hidden, false);
  key("ArrowLeft");
  assert.equal(list.hidden, true);
});

test("texComplete: $ хосолж, хоосон хосыг Backspace нэг дор устгана", () => {
  type("a ");
  assert.equal(before("insertText", "$").defaultPrevented, true);
  assert.equal(editor.value, "a $$");
  assert.equal(editor.selectionStart, 3);
  assert.equal(before("deleteContentBackward").defaultPrevented, true);
  assert.equal(editor.value, "a ");
});

test("texComplete: includegraphics сонгоход зураг сонгогч дуудна", () => {
  type("\\includegra");
  assert.equal(list.hidden, false);
  key("Tab");
  assert.match(editor.value, /^\\includegraphics/);
  assert.equal(images.length, 1);
});
