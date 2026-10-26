import "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<div><textarea id="ed"></textarea></div>' +
    '<button id="decodeBtn" hidden></button><button id="cleanBtn" hidden></button>',
);
const { createEditorWiring } = await import("../src/app/editorwiring.ts");

test.after(() => dom.close());

function wire(officeSync: boolean | null = null) {
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const calls: string[] = [];
  const log = (name: string) => (): void => void calls.push(name);
  const mdBar = {
    slot: () => "plain",
    draft: async () => "ноорог",
    writeDraft: log("writeDraft"),
    caret: () => null,
    writeCaret: log("writeCaret"),
  };
  const wiring = createEditorWiring({
    view: {
      editor,
      port: {
        el: editor,
        set: (text: string) => {
          editor.value = text;
          calls.push("set");
        },
      } as never,
      backdrop: { marksAtY: () => [] } as never,
      view: { tokenAtCaret: () => null } as never,
      marks: {
        show: log("show"),
        follow: log("follow"),
        shift: log("shift"),
        tokens: () => [],
      } as never,
      status: { hold: log("hold") } as never,
      fixButtons: {
        decode: document.querySelector<HTMLButtonElement>("#decodeBtn"),
        clean: document.querySelector<HTMLButtonElement>("#cleanBtn"),
      },
    },
    flow: {
      spell: { clear: log("spell.clear") } as never,
      loop: {
        render: async () => log("render")(),
        commit: log("commit"),
        recheckSoon: log("recheckSoon"),
        recheckAfterSeparator: async () => log("recheckSep")(),
      } as never,
      office: {
        active: () => (officeSync === null ? null : { sync: () => officeSync }),
      } as never,
      popovers: {
        pop: { hide: log("pop.hide") },
        suggestPopover: { atCaret: log("atCaret"), showFor: log("showFor") },
      } as never,
      lastCaret: { set: log("lastCaret"), get: () => null } as never,
      skipClean: () => false,
      textChanged: log("textChanged"),
      clearSource: log("clearSource"),
      mdBar: () => mdBar as never,
    },
  });
  return { wiring, editor, calls };
}

test("editorWiring: ноорог ачаалж, засварлагчид оруулна", async () => {
  const { wiring, editor } = wire();
  await wiring.draft.load();
  assert.equal(editor.value, "ноорог");
});

test("editorWiring: оруулалт бүрийг шалгалт, хадгалалт руу дамжуулна", () => {
  const { editor, calls } = wire();
  editor.value = "а";
  editor.dispatchEvent(
    new InputEvent("input", { inputType: "insertText", data: "а" }),
  );
  assert.ok(calls.includes("pop.hide"));
  assert.ok(calls.includes("textChanged"));
  assert.ok(calls.includes("recheckSoon"));
  editor.dispatchEvent(new Event("click"));
  assert.ok(calls.includes("atCaret"));
  editor.dispatchEvent(new Event("blur"));
  assert.ok(calls.includes("lastCaret"));
});

test("editorWiring: office файлд буулгах боломжгүй өөрчлөлтийг татгалзана", () => {
  const { wiring, editor, calls } = wire(false);
  editor.value = "хуучин";
  wiring.editorText.set("шинэ", 0);
  assert.equal(editor.value, "хуучин");
  assert.ok(calls.includes("hold"));
  const ok = wire(true);
  ok.editor.value = "хуучин";
  ok.wiring.editorText.set("шинэ", 0);
  assert.equal(ok.editor.value, "шинэ");
});
