import "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><button id="openBtn">Нээх</button>' +
    '<button id="pickBtn"></button><input id="openFile" type="file">' +
    '<button id="saveBtn">Хадгалах</button>',
);
const { createFileWiring } = await import("../src/app/filewiring.ts");

test.after(() => dom.close());

test("fileWiring: сонгосон текст файлыг нээж, төлөвийг шинэчилнэ", async () => {
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const calls: string[] = [];
  let loaded!: () => void;
  const done = new Promise<void>((resolve) => (loaded = resolve));
  const project = {
    unbind: () => calls.push("unbind"),
    fileOpened: (name: string) => calls.push("project:" + name),
    openExisting: () => false,
  };
  const { fileIO } = createFileWiring({
    editor: {
      el: editor,
      set: (text: string) => {
        editor.value = text;
      },
      settle: async () => {},
    } as never,
    status: { set: () => {}, hold: () => {} } as never,
    office: {
      active: () => null,
      close: () => calls.push("office.close"),
    } as never,
    doc: {
      open: (name: string | null) => calls.push("doc:" + name),
      markdownActive: () => true,
    } as never,
    pdf: { applies: () => false, save: async () => {} },
    isTex: () => false,
    project: () => project as never,
    mdBar: () =>
      ({
        slot: () => "plain",
        findFile: () => null,
        openFile: () => true,
        markSaved: () => {
          calls.push("markSaved");
          loaded();
        },
      }) as never,
    undo: () => ({ reset: () => calls.push("undo.reset") }) as never,
    refreshPreview: () => {},
  });
  const input = document.querySelector<HTMLInputElement>("#openFile")!;
  Object.defineProperty(input, "files", {
    value: [new File(["Сайн уу"], "тэмдэглэл.md", { type: "text/markdown" })],
    configurable: true,
  });
  input.dispatchEvent(new Event("change"));
  await done;
  await Promise.resolve();
  assert.equal(editor.value, "Сайн уу");
  assert.equal(fileIO.targetName(), "тэмдэглэл.md");
  assert.deepEqual(calls.slice(0, 4), [
    "office.close",
    "unbind",
    "doc:тэмдэглэл.md",
    "undo.reset",
  ]);
  assert.ok(calls.includes("project:тэмдэглэл.md"));
  assert.equal(
    document.querySelector<HTMLElement>("#openBtn")!.textContent,
    "Нээлээ",
  );
});
