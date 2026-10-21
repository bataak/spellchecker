import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<header class="topbar"></header><div class="wrap"><textarea id="ed"></textarea></div>',
);
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({
  matches: true,
  addEventListener: () => {},
  removeEventListener: () => {},
});
const g = globalThis as Record<string, unknown>;
g.ResizeObserver = class {
  observe(): void {}
  disconnect(): void {}
};
g.MutationObserver = win.MutationObserver;

const { initMdToolbar } = await import("../src/mdbar/mdtoolbar.ts");
const { enterInsert } = await import("../src/mdbar/mdedit.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function setup() {
  resetStorage();
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  editor.value = "";
  let fileName: string | null = null;
  const events: string[] = [];
  const bar = initMdToolbar({
    editor,
    mount: document.querySelector<HTMLElement>("header.topbar")!,
    isMdFile: () => fileName?.endsWith(".md") ?? false,
    fileName: () => fileName,
    onTemplate: (id, from) => events.push(from + "→" + id),
  });
  return {
    bar,
    editor,
    events,
    setFile: (name: string | null) => {
      fileName = name;
    },
  };
}

test("mdToolbar: файл нээж хаахад өмнөх цонхны ноорог сэргэнэ", async () => {
  const { bar, editor, events, setFile } = setup();
  const start = bar.slot();
  editor.value = "сайн байна";
  assert.equal(bar.openFile("a.md"), true);
  setFile("a.md");
  const file = bar.template();
  assert.notEqual(file, start);
  assert.equal(editor.value, "");
  editor.value = "файлын бичвэр";
  assert.deepEqual(
    bar.fileSlots().map((slot) => slot.name),
    ["a.md"],
  );
  setFile(null);
  bar.closeFile(file, true);
  await wait();
  assert.equal(bar.slot(), start);
  assert.equal(editor.value, "сайн байна");
  assert.deepEqual(events, [start + "→" + file, file + "→" + start]);
  bar.destroy();
});

test("mdToolbar: тод товч сонгосон хэсгийг ороож, Enter догол мөрийг хоосон мөрөөр тусгаарлана", () => {
  const { bar, editor, setFile } = setup();
  bar.openFile("b.md");
  setFile("b.md");
  bar.refresh();
  editor.value = "нэг хоёр";
  editor.setSelectionRange(4, 8);
  document
    .querySelector<HTMLElement>('.md-btn[data-role="bold"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(editor.value, "нэг **хоёр**");
  const line = "нэг";
  editor.value = line;
  editor.setSelectionRange(line.length, line.length);
  const event = new InputEvent("beforeinput", {
    inputType: "insertParagraph",
    cancelable: true,
  });
  editor.dispatchEvent(event);
  assert.equal(enterInsert(line, line.length), "\n\n");
  assert.equal(event.defaultPrevented, true);
  assert.equal(editor.value, "нэг\n\n");
  bar.destroy();
});
