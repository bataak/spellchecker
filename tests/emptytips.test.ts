import { strict as assert } from "node:assert";
import { test } from "node:test";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<p id="info"></p><p id="action"></p>');
Object.assign(globalThis, {
  matchMedia: dom.window.matchMedia.bind(dom.window),
});
const { createEmptyTips } = await import("../src/ui/emptytips.ts");

test.after(() => dom.close());

test("emptyTips: эхэнд зөвлөмж бичиж, бичвэр арилахад сольж эхэлнэ", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const info = document.querySelector<HTMLElement>("#info")!;
  const action = document.querySelector<HTMLElement>("#action")!;
  const tips = createEmptyTips({ info, action });
  assert.notEqual(info.textContent, "");
  assert.notEqual(action.textContent, "");
  tips.sync(true);
  assert.equal(info.classList.contains("tip-swap"), false);
  tips.sync(false);
  tips.sync(true);
  assert.equal(info.classList.contains("tip-swap"), true);
  t.mock.timers.tick(200);
  assert.equal(info.classList.contains("tip-swap"), false);
  tips.rotate();
  assert.equal(action.classList.contains("tip-swap"), true);
});

test("emptyTips: элементгүй үед юу ч хийхгүй", () => {
  const tips = createEmptyTips({ info: null, action: null });
  tips.rotate();
  tips.sync(true);
});
