import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><button id="defineBtn"></button>',
);
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({ matches: false });

const { initDefineControls } = await import("../src/define/definecontrols.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

resetStorage();
const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
const button = document.querySelector<HTMLButtonElement>("#defineBtn")!;
const calls: string[] = [];
let caretError: { word: string; start: number; end: number } | null = null;
let dicts = 1;
initDefineControls({
  editor,
  button,
  backdrop: {} as never,
  checker: {
    loadedIds: ["mn_MN"],
    define: async () => ({ dicts, source: "", entries: [] }),
    listDicts: async () => [],
    onDictScripts: () => () => {},
  } as never,
  defTip: {
    definitionFor: async () => ({ dicts, source: "", entries: [] }),
    showWordDefinition: async (span: { word: string }) => {
      calls.push("show:" + span.word);
    },
    resetDefinitions: () => {},
  } as never,
  defDock: {} as never,
  pop: {} as never,
  holdStatus: (html: string) => calls.push("status:" + html.slice(0, 12)),
  englishEnabled: () => new Set(),
  errorAtCaret: () => caretError,
  showErrorPopover: (token) => calls.push("error:" + token.word),
});

function caret(text: string, at: number): void {
  editor.value = text;
  editor.setSelectionRange(at, at);
}

test("defineControls: курсор алдаан дээр бол алдааны popover, үгэн дээр бол тайлбар", async () => {
  calls.length = 0;
  caretError = { word: "алдаа", start: 0, end: 5 };
  button.click();
  caretError = null;
  caret("сайн ном", 6);
  button.click();
  await wait();
  caret("   ", 1);
  button.click();
  await wait();
  assert.deepEqual(calls, ["error:алдаа", "show:ном", "status:Тайлбар хара"]);
});

test("defineControls: толь алга бол толь нэмэх зааврыг харуулж, Shift-ээр толь удирдах цонх нээнэ", async () => {
  calls.length = 0;
  dicts = 0;
  caret("ном", 1);
  button.click();
  await wait();
  dicts = 1;
  assert.deepEqual(calls, ["status:Толь нэмэхий"]);
  button.dispatchEvent(new MouseEvent("click", { shiftKey: true }));
  await wait();
  assert.equal(document.querySelector<HTMLDialogElement>("dialog")?.open, true);
});

test("defineControls: F2 товч тайлбар харуулна", async () => {
  calls.length = 0;
  caret("сайн ном", 2);
  const event = new KeyboardEvent("keydown", { code: "F2", cancelable: true });
  editor.dispatchEvent(event);
  await wait();
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls, ["show:сайн"]);
});
