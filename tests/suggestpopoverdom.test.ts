import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<textarea id="ed"></textarea><div id="popover" hidden></div><span id="mark"></span>',
);
const win = dom.window as unknown as Record<string, unknown>;
win.matchMedia = () => ({ matches: false });

const { initSuggestPopover } = await import("../src/spellui/suggestpopover.ts");

test.after(() => dom.close());

function setup(suggestions: string[], readOnly = false) {
  resetStorage();
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  editor.value = "энэ алдатай үг";
  editor.readOnly = readOnly;
  const popover = document.querySelector<HTMLElement>("#popover")!;
  popover.innerHTML = "";
  let openAt: number | null = null;
  const applied: string[] = [];
  const events: string[] = [];
  const pop = {
    open: (start: number) => {
      openAt = start;
      popover.hidden = false;
    },
    isOpenAt: (start: number) => openAt === start,
    list: () => popover.querySelector<HTMLElement>(".pop-list"),
    measure: () => {},
    place: () => {},
    updateScrollHint: () => {},
    obscuredBy: () => 0,
    hide: () => {
      openAt = null;
      events.push("hide");
    },
  };
  const ui = initSuggestPopover({
    editor,
    backdrop: {
      markAt: () => document.querySelector<HTMLElement>("#mark"),
    } as never,
    popover,
    pop: pop as never,
    defTip: { hide: () => {}, bindDot: () => {} } as never,
    checker: {
      checkWords: async (words: string[]) =>
        Object.fromEntries(words.map((w) => [w, false])),
      suggest: async () => suggestions,
    } as never,
    desktopMQ: { matches: true } as MediaQueryList,
    render: async () => {
      events.push("render");
    },
    apply: async (_token, replacement) => {
      applied.push(replacement);
    },
    attachKeyboard: () => {},
    errorAtCaret: () => null,
  });
  const token = { word: "алдатай", start: 4, end: 11 };
  return { ui, popover, applied, events, token };
}

test("suggestPopover: саналуудыг жагсааж, дарахад сольж, алгасахад жагсаалтад нэмнэ", async () => {
  const { ui, popover, applied, events, token } = setup(["алдаатай", "алдарт"]);
  await ui.showFor(token);
  const buttons = [
    ...popover.querySelectorAll<HTMLElement>(".sg:not(.sg-ignore)"),
  ];
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ["алдаатай", "алдарт"],
  );
  buttons[0]!.click();
  await Promise.resolve();
  assert.deepEqual(applied, ["алдаатай"]);
  popover.querySelector<HTMLElement>(".sg-ignore")!.click();
  assert.deepEqual(events, ["hide", "render"]);
  assert.match(localStorage.getItem("mn-spell:ignored") ?? "", /алдатай/);
});

test("suggestPopover: санал алга бол засварлах боломжгүй үед мэдэгдэнэ", async () => {
  const { ui, popover, token } = setup([]);
  await ui.showFor(token);
  assert.equal(popover.querySelector(".pop-empty")!.textContent, "санал алга");
  assert.equal(popover.querySelector(".pop-fix-open"), null);
});

test("suggestPopover: зөвхөн уншихад санал алга бол гараар засах талбар нээнэ", async () => {
  const { ui, popover, applied, token } = setup([], true);
  await ui.showFor(token);
  popover.querySelector<HTMLElement>(".pop-fix-open")!.click();
  const input = popover.querySelector<HTMLInputElement>(".pop-fix-input")!;
  const ok = popover.querySelector<HTMLButtonElement>(".pop-fix-ok")!;
  assert.equal(input.value, "алдатай");
  assert.equal(ok.disabled, true);
  input.value = "алдаатай";
  input.dispatchEvent(new Event("input"));
  assert.equal(ok.disabled, false);
  popover
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await Promise.resolve();
  assert.deepEqual(applied, ["алдаатай"]);
});
