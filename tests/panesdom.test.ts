import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const PAGE =
  '<main class="workspace"><div class="editor-wrap"><textarea id="editor"></textarea></div></main>' +
  '<aside><h2 id="errorPanelTitle"></h2><div id="errorList"></div>' +
  '<button id="copyErrorsBtn">copy</button></aside>';
const dom = installDom(PAGE);
const { initPaneToggle } = await import("../src/ui/panetoggle.ts");
const { initErrorPanel } = await import("../src/spellui/errorpanel.ts");
type Backdrop = import("../src/editor/backdrop.ts").Backdrop;
type Token = import("../src/spell/textcheck.ts").Token;

test.after(() => dom.close());

const editor = (): HTMLTextAreaElement =>
  document.querySelector<HTMLTextAreaElement>("#editor")!;

test("paneToggle: зөвхөн боломжтой ба хажуу байрлалгүй үед харагдана", () => {
  let side = false;
  const changes: boolean[] = [];
  const pane = initPaneToggle(
    document.querySelector<HTMLElement>(".workspace")!,
    editor(),
    () => side,
    (on) => changes.push(on),
  );
  const button = document.querySelector<HTMLButtonElement>(".pane-toggle")!;
  assert.equal(button.hidden, true);
  pane.setAvailable(true);
  assert.equal(button.hidden, false);

  button.click();
  assert.equal(document.documentElement.dataset.pane, "preview");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.parentElement?.className, "workspace");

  button.click();
  assert.equal(document.documentElement.dataset.pane, undefined);
  assert.equal(button.parentElement?.className, "editor-wrap");

  button.click();
  side = true;
  pane.sync();
  assert.equal(button.hidden, true);
  assert.equal(document.documentElement.dataset.pane, undefined);
  assert.deepEqual(changes, [true, false, true, false]);
});

function panel(tokens: Token[], desktop = true) {
  document.body.innerHTML = PAGE;
  const calls: string[] = [];
  const area = editor();
  area.value = "морь үхэр морь тэмээ";
  const control = initErrorPanel({
    editor: area,
    backdrop: { markAt: () => null } as unknown as Backdrop,
    desktopMQ: { matches: desktop } as MediaQueryList,
    badTokens: () => tokens,
    lastCaret: () => null,
    setLastCaret: (caret) => calls.push(`caret:${caret.start}`),
    onPick: () => calls.push("pick"),
    syncScroll: () => calls.push("scroll"),
    showPopoverFor: (token) => calls.push("pop:" + token.word),
  });
  return { control, calls };
}

const at = (word: string, start: number): Token => ({
  word,
  start,
  end: start + word.length,
});

test("errorPanel: давтагдсан үгийг тоолж нэг товч болгоно", () => {
  const { control } = panel([at("морь", 0), at("үхэр", 5), at("морь", 10)]);
  control.render();
  const list = document.querySelector("#errorList")!;
  const buttons = [...list.querySelectorAll<HTMLElement>(".ew")];
  assert.deepEqual(
    buttons.map((button) => button.firstChild?.textContent),
    ["морь", "үхэр"],
  );
  assert.equal(buttons[0]!.querySelector(".ew-count")?.textContent, "2");
  assert.equal(
    document.querySelector("#errorPanelTitle")!.textContent,
    "Нийт алдаатай үг: 3",
  );
  assert.equal(
    document.querySelector<HTMLButtonElement>("#copyErrorsBtn")!.disabled,
    false,
  );
});

test("errorPanel: алдаагүй үед хоосолж, хуулах товчийг унтраана", () => {
  const { control } = panel([]);
  control.render();
  assert.equal(document.querySelector("#errorList")!.innerHTML, "");
  assert.equal(
    document.querySelector("#errorPanelTitle")!.textContent,
    "Алдаагүй",
  );
  assert.equal(
    document.querySelector<HTMLButtonElement>("#copyErrorsBtn")!.disabled,
    true,
  );
});

test("errorPanel: гар утсан дээр жагсаалт зурахгүй", () => {
  const { control } = panel([at("морь", 0)], false);
  control.render();
  assert.equal(document.querySelector("#errorList")!.innerHTML, "");
});

test("errorPanel: товч дарахад тухайн үгийг сонгож popover нээнэ", () => {
  const { control, calls } = panel([at("морь", 0), at("морь", 10)]);
  control.render();
  document.querySelector<HTMLElement>('.ew[data-start="0"]')!.click();
  const area = editor();
  assert.equal(area.selectionStart, 0);
  assert.equal(area.selectionEnd, 4);
  assert.equal(area.dataset.pick, "other");
  assert.deepEqual(calls, ["pick", "caret:4", "pop:морь"]);
});
