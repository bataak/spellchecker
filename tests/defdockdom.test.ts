import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<div id="ws"><div id="wrap"><textarea class="editor"></textarea></div><aside id="panel"><div class="error-panel-foot"></div></aside></div>',
);

const { initDefDock } = await import("../src/define/defdock.ts");

test.after(() => dom.close());

function setup() {
  resetStorage();
  document.querySelector(".def-dock")?.remove();
  const workspace = document.querySelector<HTMLElement>("#ws")!;
  const editorWrap = document.querySelector<HTMLElement>("#wrap")!;
  const errorPanel = document.querySelector<HTMLElement>("#panel")!;
  const dock = initDefDock({
    workspace,
    editorWrap,
    errorPanel,
    desktopMQ: {
      matches: true,
      addEventListener: () => {},
    } as unknown as MediaQueryList,
    room: () => true,
  });
  return { dock, workspace, editorWrap, errorPanel };
}

test("defDock: зүүн талд байрлуулж, агуулга хийж, хаахад арилна", () => {
  const { dock, editorWrap } = setup();
  assert.equal(dock.body(), null);
  const shown: string[] = [];
  dock.onShow(() => shown.push("shown"));
  const extra = document.createElement("button");
  extra.className = "extra";
  dock.addControl(extra);
  const word = document.createElement("p");
  word.textContent = "тайлбар";
  dock.dock("left", [word]);
  const pane = document.querySelector<HTMLElement>(".def-dock")!;
  assert.equal(pane.nextElementSibling, editorWrap);
  assert.equal(pane.dataset.place, "left");
  assert.equal(document.documentElement.dataset.dockCol, "left");
  assert.equal(dock.body()!.textContent, "тайлбар");
  assert.deepEqual(shown, ["shown"]);
  assert.ok(pane.querySelector(".def-dock-head .extra"));
  dock.clear();
  assert.ok(dock.body()!.querySelector(".def-empty"));
  pane
    .querySelector<HTMLElement>(".def-dock-head > button:last-child")!
    .click();
  assert.equal(dock.body(), null);
  assert.equal(pane.isConnected, false);
  assert.equal(document.documentElement.dataset.dockCol, undefined);
});

test("defDock: самбарын доод хэсэгт байрлуулж, нуухад алга болно", () => {
  const { dock, errorPanel } = setup();
  dock.dock("panel");
  const pane = document.querySelector<HTMLElement>(".def-dock")!;
  assert.equal(pane.parentElement, errorPanel);
  assert.equal(pane.nextElementSibling?.className, "error-panel-foot");
  dock.sync(false);
  assert.equal(dock.body(), null);
  dock.sync(true);
  assert.ok(dock.body());
});

test("defDock: зааж буй бүсийг тодруулж, байхгүй бол нууна", () => {
  const { dock } = setup();
  dock.hint("right");
  const hint = document.querySelector<HTMLElement>(".dock-hint")!;
  assert.equal(hint.hidden, false);
  dock.hint(null);
  assert.equal(hint.hidden, true);
});
