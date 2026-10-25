import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";

const dom = installDom();
const { initUndoHistory, pruneHistories, storedHistoryTexts } =
  await import("../src/editor/undohistory.ts");
const { applyRemote, swapText } = await import("../src/editor/editortext.ts");

test.after(() => dom.close());

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function editorWith(text: string): HTMLTextAreaElement {
  const editor = document.createElement("textarea");
  document.body.appendChild(editor);
  editor.value = text;
  editor.setSelectionRange(text.length, text.length);
  return editor;
}

function type(editor: HTMLTextAreaElement, chunk: string): void {
  const at = editor.value.length;
  editor.value += chunk;
  editor.setSelectionRange(at + chunk.length, at + chunk.length);
  editor.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" }),
  );
}

function key(editor: HTMLTextAreaElement, name: string, shift = false): void {
  editor.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      ctrlKey: true,
      shiftKey: shift,
      bubbles: true,
    }),
  );
}

test("Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z засварыг буцааж, дахин хийнэ", () => {
  const editor = editorWith("");
  initUndoHistory({ editor, slot: () => "keys" });
  type(editor, "Сайн");
  type(editor, " байна\n");
  key(editor, "z");
  assert.equal(editor.value, "Сайн");
  key(editor, "y");
  assert.equal(editor.value, "Сайн байна\n");
  key(editor, "z");
  key(editor, "z", true);
  assert.equal(editor.value, "Сайн байна\n");
  key(editor, "x");
  assert.equal(editor.value, "Сайн байна\n");
});

test("хөтчийн historyUndo оролтыг өөрийн түүхээр гүйцэтгэнэ", () => {
  const editor = editorWith("");
  initUndoHistory({ editor, slot: () => "input" });
  type(editor, "нэг\n");
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "historyUndo",
  });
  editor.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(editor.value, "");
  editor.dispatchEvent(
    new InputEvent("beforeinput", { bubbles: true, inputType: "historyRedo" }),
  );
  assert.equal(editor.value, "нэг\n");
});

test("бусдын засвар түүхийг шилжүүлж, өөрийн засвар л буцна", () => {
  const editor = editorWith("");
  initUndoHistory({ editor, slot: () => "remote" });
  type(editor, "абв\n");
  applyRemote(editor, [{ from: 4, to: 4, insert: "X" }]);
  assert.equal(editor.value, "абв\nX");
  key(editor, "z");
  assert.equal(editor.value, "X");
});

test("түүх хадгалагдаж, ижил бичвэртэй слот дахин нээхэд сэргэнэ", async () => {
  const first = editorWith("");
  const control = initUndoHistory({ editor: first, slot: () => "saved" });
  type(first, "хадгалах\n");
  await wait(1200);
  assert.ok((await storedHistoryTexts()).includes("хадгалах\n"));
  const second = editorWith("хадгалах\n");
  initUndoHistory({ editor: second, slot: () => "saved" });
  await wait(50);
  key(second, "z");
  assert.equal(second.value, "");
  await control.forget("saved");
  assert.equal((await storedHistoryTexts()).includes("хадгалах\n"), false);
});

test("слот солиход тухайн слотын түүх ачаалагдаж, reset нь цэвэрлэнэ", () => {
  const editor = editorWith("");
  let slot = "a";
  const control = initUndoHistory({ editor, slot: () => slot });
  type(editor, "А слот\n");
  slot = "b";
  swapText(editor, "", { origin: "slot" });
  type(editor, "Б\n");
  slot = "a";
  swapText(editor, "А слот\n", { origin: "slot" });
  key(editor, "z");
  assert.equal(editor.value, "");
  control.reset();
  key(editor, "y");
  assert.equal(editor.value, "");
});

test("хуучирсан болон хэрэггүй слотын түүхийг цэвэрлэнэ", async () => {
  const editor = editorWith("");
  initUndoHistory({ editor, slot: () => "file-old" });
  type(editor, "хуучин\n");
  await wait(1200);
  const dropped = await pruneHistories({
    files: new Set(),
    project: null,
    now: Date.now(),
  });
  assert.ok(dropped >= 1);
  assert.equal((await storedHistoryTexts()).includes("хуучин\n"), false);
});
