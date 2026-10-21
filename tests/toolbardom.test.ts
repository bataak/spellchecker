import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<nav class="toolbar"><button id="clearBtn" class="tbtn">Цэвэрлэх</button><button id="pasteBtn" class="tbtn">Буулгах</button><button id="copyBtn" class="tbtn">Хуулах</button></nav><textarea id="ed"></textarea><p id="status"></p>',
);
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({ matches: true });
win.isSecureContext = true;
let clipboardText = "";
const copied: string[] = [];
Object.defineProperty(dom.window.navigator, "clipboard", {
  value: {
    readText: async () => clipboardText,
    writeText: async (text: string) => {
      copied.push(text);
    },
  },
  configurable: true,
});

const { initToolbar } = await import("../src/ui/toolbar.ts");

test.after(() => dom.close());

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

resetStorage();
const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const calls: string[] = [];
let officeActive = false;
let openFile = false;
initToolbar({
  editor: {
    el: editor,
    insert: (text: string, start: number, end: number) => {
      editor.value =
        editor.value.slice(0, start) + text + editor.value.slice(end);
      calls.push("insert");
    },
    render: async () => {},
    save: () => calls.push("save"),
    replace: async (text: string) => {
      editor.value = text;
      calls.push("replace");
    },
  } as never,
  status: {
    set: (html: string) => {
      statusEl.innerHTML = html;
    },
    hold: () => {},
    release: () => {},
  },
  statusEl,
  office: { active: () => officeActive, close: () => calls.push("office") },
  forgetFile: () => calls.push("forget"),
  afterClear: (cleared) => calls.push("after:" + cleared),
  lettersFixed: () => calls.push("letters"),
  hasOpenFile: () => openFile,
  badTokens: () => [
    { word: "алдаа", start: 0, end: 5 },
    { word: "алдаа", start: 6, end: 11 },
    { word: "буруу", start: 12, end: 17 },
  ],
});

const click = (id: string) => document.querySelector<HTMLElement>(id)!.click();

test("toolbar: хоосон бол цэвэрлэх нь юу ч арилгахгүй, бичвэртэй бол хадгалаад арилгана", () => {
  calls.length = 0;
  editor.value = "";
  click("#clearBtn");
  assert.deepEqual(calls, ["after:false"]);
  calls.length = 0;
  editor.value = "сайн байна";
  click("#clearBtn");
  assert.deepEqual(calls, ["office", "forget", "replace", "after:true"]);
  assert.equal(editor.value, "");
  assert.equal(localStorage.getItem("mn-spell:last-cleared"), "сайн байна");
});

test("toolbar: буулгахдаа үсгийг стандартчилж курсорын байрлалд оруулна", async () => {
  calls.length = 0;
  editor.value = "AB";
  editor.setSelectionRange(1, 1);
  clipboardText = "н\u0473м";
  click("#pasteBtn");
  await wait();
  assert.equal(editor.value, "AнөмB");
  assert.deepEqual(calls, ["insert", "save", "letters"]);
  calls.length = 0;
  officeActive = true;
  click("#pasteBtn");
  await wait();
  officeActive = false;
  assert.deepEqual(calls, []);
});

test("toolbar: хуулах нь бичвэрийг, удаан дарвал алдаатай үгсийг давхардалгүй хуулна", async () => {
  copied.length = 0;
  editor.value = "бичвэр";
  click("#copyBtn");
  await wait();
  const btn = document.querySelector<HTMLElement>("#copyBtn")!;
  btn.dispatchEvent(new PointerEvent("pointerdown"));
  await wait(550);
  btn.dispatchEvent(new PointerEvent("pointerup"));
  click("#copyBtn");
  await wait();
  assert.deepEqual(copied, ["бичвэр", "алдаа\nбуруу"]);
  assert.equal(statusEl.textContent, "Алдаатай үгс хуулагдлаа");
});
