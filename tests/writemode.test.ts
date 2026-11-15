import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers/mock-storage.ts";
import { resetStorage } from "./helpers/mock-storage.ts";
import { installDom } from "./helpers/dom.ts";
import { writeLayout } from "../src/ui/layout.ts";
import {
  createWriteMode,
  isWriteKey,
  writeTools,
} from "../src/ui/writemode.ts";

const dom = installDom();
test.after(() => dom.close());

const key = (init: KeyboardEventInit): KeyboardEvent =>
  new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });

test("writeLayout: самбар ба урьдчилан харахыг хааж, өргөнийг хадгална", () => {
  assert.deepEqual(writeLayout({ measure: "c", panel: true, preview: true }), {
    measure: "c",
    panel: false,
    preview: false,
  });
});

test("isWriteKey: Ctrl/⌘+Shift+F-ийг таньж, Alt-тайг хүлээж авахгүй", () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    shiftKey: true,
    altKey: false,
  };
  assert.ok(isWriteKey({ ...base, ctrlKey: true, key: "F", code: "KeyF" }));
  assert.ok(isWriteKey({ ...base, metaKey: true, key: "Ө", code: "KeyF" }));
  assert.ok(!isWriteKey({ ...base, key: "F", code: "KeyF" }));
  assert.ok(
    !isWriteKey({
      ...base,
      ctrlKey: true,
      altKey: true,
      key: "F",
      code: "KeyF",
    }),
  );
});

test("createWriteMode: товчлолоор асааж унтрааж, төлөвийг хадгална", () => {
  resetStorage();
  const mode = createWriteMode();
  const seen: boolean[] = [];
  mode.onChange((on) => seen.push(on));
  assert.equal(mode.on(), false);

  const press = key({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
  document.dispatchEvent(press);
  assert.equal(mode.on(), true);
  assert.ok(press.defaultPrevented);
  assert.equal(document.documentElement.dataset.write, "on");
  mode.destroy();

  const again = createWriteMode();
  assert.equal(again.on(), true);
  again.set(false);
  assert.equal(document.documentElement.dataset.write, undefined);
  assert.deepEqual(seen, [true]);
  again.destroy();
  assert.equal(createWriteMode().on(), false);
});

test("writeTools: Гарах товч горимоос гаргана", () => {
  resetStorage();
  const mode = createWriteMode();
  mode.set(true);
  const tools = document.createElement("div");

  const remove = writeTools(tools, mode, "Ctrl+Shift+F");
  const exit = tools.querySelector<HTMLButtonElement>(".write-tool");
  assert.match(exit!.title, /Ctrl\+Shift\+F/);
  exit!.click();
  assert.equal(mode.on(), false);

  remove();
  assert.equal(tools.querySelectorAll(".write-tool").length, 0);
  mode.destroy();
});
