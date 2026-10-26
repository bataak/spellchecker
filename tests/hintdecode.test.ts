import { resetStorage } from "./helpers/mock-storage.ts";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><button id="decodeBtn" hidden>Үсэг таниулах</button>' +
    '<button id="cleanBtn" hidden>Цэвэрлэх</button><button id="target">Т</button>',
);
Object.assign(dom.window, {
  matchMedia: () => ({ matches: false }),
  setTimeout: (run: () => void, ms?: number) => setTimeout(run, ms),
  clearTimeout: (id?: ReturnType<typeof setTimeout>) => clearTimeout(id),
});
Object.defineProperty(document.documentElement, "clientHeight", { value: 768 });

const hints = await import("../src/ui/hint.ts");
const { initDecode, initClean } = await import("../src/editor/decode.ts");

test.after(() => dom.close());

const MOJIBAKE = "Ìîíãîë";

function sized(el: HTMLElement): HTMLElement {
  el.getBoundingClientRect = () => new DOMRect(100, 300, 80, 30);
  return el;
}

test("hint: тайван болсны дараа нэг удаа харуулж, дарахад нууж, дахин харуулахгүй", () => {
  resetStorage();
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const target = sized(document.querySelector<HTMLElement>("#target")!);
    const list = [
      hints.layoutHint(() => null),
      hints.exportHint(() => target),
      hints.openHint(() => target),
    ];
    const poke = hints.initHints(() => list);
    poke();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    mock.timers.tick(600);
    assert.equal(document.querySelector(".hint-bubble"), null);
    mock.timers.tick(2500);
    const bubble = document.querySelector<HTMLElement>(".hint-bubble")!;
    assert.match(bubble.innerHTML, /<kbd>/);
    assert.equal(bubble.dataset.side, "above");
    assert.equal(target.dataset.hinted, "");
    assert.equal(localStorage.length, 1);
    document.dispatchEvent(new Event("pointerdown"));
    assert.equal(document.querySelector(".hint-bubble"), null);
    assert.equal(target.dataset.hinted, undefined);
    poke();
    mock.timers.tick(20000);
    assert.match(document.querySelector(".hint-bubble")!.innerHTML, /файлууд/);
    mock.timers.tick(12000);
    assert.equal(document.querySelector(".hint-bubble"), null);
    poke();
    mock.timers.tick(60000);
    assert.equal(document.querySelector(".hint-bubble"), null);
  } finally {
    mock.timers.reset();
  }
});

test("hint: курсорыг дагах сануулга Escape-ээр л хаагдана", () => {
  resetStorage();
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const area = sized(document.querySelector<HTMLElement>("#ed")!);
    const poke = hints.initHints(() => [
      hints.keyboardHint(
        () => area,
        () => new DOMRect(10, 10, 2, 16),
      ),
    ]);
    poke();
    mock.timers.tick(3200);
    const bubble = document.querySelector<HTMLElement>(".hint-bubble")!;
    assert.equal(bubble.dataset.side, "below");
    area.dispatchEvent(new Event("input"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    assert.ok(bubble.isConnected);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(bubble.isConnected, false);
  } finally {
    mock.timers.reset();
  }
});

test("hint: тайлбарын бусад загварууд өөр өөр id-тай", () => {
  const ids = [
    hints.defineHint(() => null),
    hints.spellDictHint(() => null),
    hints.modeHint(() => null),
  ].map((hint) => hint.id);
  assert.deepEqual(ids, ["define", "spelldict", "mode"]);
});

function editor() {
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const calls: string[] = [];
  const port = {
    el: area,
    reformat: async (text: string, caret: number) => {
      calls.push(text + "@" + caret);
      area.value = text;
    },
  } as never;
  return { area, calls, port };
}

const inserted = (data: string): InputEvent =>
  new InputEvent("input", { inputType: "insertText", data });

test("decode: эвдэрсэн кирилл бичвэрийг илрүүлж, товчоор хөрвүүлнэ", async () => {
  const { area, calls, port } = editor();
  const button = document.querySelector<HTMLButtonElement>("#decodeBtn")!;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    area.value = "";
    const control = initDecode({ editor: port, invalidate: () => {}, button });
    control.sync();
    assert.equal(button.hidden, true);
    area.value = MOJIBAKE + " ";
    area.selectionStart = area.selectionEnd = area.value.length;
    control.afterInput(inserted(" "));
    assert.equal(button.hidden, false);
    button.click();
    assert.deepEqual(calls, ["Монгол @7"]);
    assert.match(button.textContent!, /^Хөрвүүлэв — 1 үг/);
    assert.equal(button.disabled, true);
    mock.timers.tick(1400);
    mock.timers.tick(900);
    assert.equal(button.textContent, "Үсэг таниулах");
    assert.equal(button.disabled, false);
    area.value = "Монгол";
    control.sync();
    assert.equal(button.hidden, true);
  } finally {
    mock.timers.reset();
  }
});

test("decode: буулгасан бичвэр, сонголт, хоосон үр дүнг зохицуулна", async () => {
  const { area, calls, port } = editor();
  const button = document.querySelector<HTMLButtonElement>("#cleanBtn")!;
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    area.value = "";
    const control = initClean({ editor: port, invalidate: () => {}, button });
    const paste = new Event("paste") as Event & {
      clipboardData: { getData: () => string };
    };
    paste.clipboardData = { getData: () => "хvн" };
    area.dispatchEvent(paste);
    assert.equal(button.hidden, false);
    area.value = "хvн хvн";
    control.afterInput(inserted("н"));
    area.setSelectionRange(0, 3);
    button.click();
    assert.deepEqual(calls, ["хүн хvн@3"]);
    area.value = "Монгол";
    area.setSelectionRange(0, 0);
    mock.timers.tick(1400);
    mock.timers.tick(900);
    button.click();
    assert.equal(button.textContent, "Цэвэрлэх зүйл олдсонгүй");
    control.announce("Болсон");
    assert.equal(button.textContent, "Болсон");
    mock.timers.tick(1400);
    mock.timers.tick(900);
    control.afterInput(new InputEvent("input", { inputType: "deleteContent" }));
    mock.timers.tick(500);
    assert.equal(button.hidden, true);
    area.value = "хvн";
    control.afterInput(inserted("н"));
    mock.timers.tick(500);
    assert.equal(button.hidden, false);
  } finally {
    mock.timers.reset();
  }
});
