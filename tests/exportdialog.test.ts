import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><button id="save"></button><button id="print"></button>',
);
const g = globalThis as unknown as Record<string, unknown>;
g.URL = Object.assign(URL, {
  createObjectURL: () => "blob:x",
  revokeObjectURL: () => {},
});

const { initExport } = await import("../src/export/export.ts");
const { createSaveChain } = await import("../src/ui/savechain.ts");
const { onDownload } = await import("../src/files/download.ts");

test.after(() => dom.close());

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(template = "report") {
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const saveButton = document.querySelector<HTMLElement>("#save")!;
  const saveChain = createSaveChain(null);
  const done: string[] = [];
  const empty: number[] = [];
  editor.value = "Бичвэр.\n";
  const control = initExport({
    editor,
    baseName: () => "тайлан.md",
    template: () => template,
    saveButton,
    saveChain,
    printButton: document.querySelector<HTMLElement>("#print"),
    onDone: (name) => done.push(name),
    onEmpty: () => empty.push(1),
  });
  const overlay = document.querySelector<HTMLElement>(".export-backdrop")!;
  const key = (init: KeyboardEventInit) =>
    document.dispatchEvent(new KeyboardEvent("keydown", init));
  return { control, overlay, saveButton, saveChain, done, empty, key, editor };
}

test("exportDialog: Ctrl+Alt+S нээж, сонгосон форматаар татаж авна", async () => {
  const { control, overlay, done, key, editor } = setup();
  editor.value = "# Гарчиг\n\nБичвэр.\n";
  const downloads: number[] = [];
  const off = onDownload(() => downloads.push(1));
  key({ key: "s", code: "KeyS", ctrlKey: true, altKey: true });
  assert.equal(overlay.hidden, false);
  const name = overlay.querySelector<HTMLInputElement>(".export-name")!;
  overlay.querySelector<HTMLElement>('[data-format="md"]')!.click();
  assert.equal(name.value, "тайлан.md");
  assert.equal(
    overlay.querySelector<HTMLElement>('[data-format="txt"]')!.hidden,
    true,
  );
  overlay.querySelector<HTMLElement>(".export-confirm")!.click();
  await tick();
  assert.equal(overlay.hidden, true);
  assert.deepEqual(done, ["тайлан.md"]);
  assert.equal(downloads.length, 1);
  off();
  control.destroy();
});

test("exportDialog: Escape хааж, дахин нээхэд хэрэглэгчийн сонголтыг санана", () => {
  const { control, overlay, key } = setup();
  control.open();
  overlay.querySelector<HTMLElement>('[data-format="tex"]')!.click();
  overlay.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(overlay.hidden, true);
  key({ key: "s", code: "KeyS", metaKey: true, altKey: true });
  const name = overlay.querySelector<HTMLInputElement>(".export-name")!;
  assert.equal(name.value, "тайлан.tex");
  control.destroy();
});

test("exportDialog: Shift+хадгалах ба удаан дарахад ердийн хадгалалтыг булааж цонх нээнэ", async () => {
  const { control, overlay, saveButton, saveChain } = setup("plain");
  const handled: string[] = [];
  saveChain.handle(() => {
    handled.push("save");
    return true;
  });
  saveChain.run({ shift: false });
  assert.deepEqual(handled, ["save"]);
  assert.equal(overlay.hidden, true);
  saveChain.run({ shift: true });
  assert.equal(overlay.hidden, false);
  assert.deepEqual(handled, ["save"]);
  control.open();
  overlay.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  saveButton.dispatchEvent(new PointerEvent("pointerdown", { button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(overlay.hidden, false);
  saveChain.run({ shift: false });
  assert.deepEqual(handled, ["save"]);
  control.destroy();
  assert.equal(document.querySelector(".export-backdrop"), null);
});

test("exportDialog: бичвэр хоосон бол цонх нээгдэхгүй", () => {
  const { control, overlay, saveChain, empty, key, editor } = setup();
  editor.value = "  \n";
  key({ key: "s", code: "KeyS", ctrlKey: true, altKey: true });
  saveChain.run({ shift: true });
  control.open();
  assert.equal(overlay.hidden, true);
  assert.equal(empty.length, 3);
  control.destroy();
});
