import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<div id="host"><div id="bar"></div></div>');
const globals = globalThis as Record<string, unknown>;
globals.ResizeObserver = dom.window.ResizeObserver;
globals.WheelEvent = dom.window.WheelEvent;
const { initScrollHint } = await import("../src/ui/scrollhint.ts");

test.after(() => dom.close());

const bar = document.querySelector<HTMLElement>("#bar")!;
let content = 0;
Object.defineProperty(bar, "clientWidth", { get: () => 300 });
Object.defineProperty(bar, "scrollWidth", { get: () => content });

const arrows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(".scroll-arrow"),
];
const shown = (): string[] =>
  arrows()
    .filter((arrow) => !arrow.hidden)
    .map((arrow) => arrow.className.replace("scroll-arrow is-", ""));

test("scrollHint: багтвал сум, бүдгэрэлт гаргахгүй", () => {
  const hint = initScrollHint(bar);
  content = 300;
  hint.sync();
  assert.deepEqual(shown(), []);
  assert.equal(bar.className, "");
  hint.destroy();
  assert.equal(arrows().length, 0);
});

test("scrollHint: илүүдэл талдаа сум гаргаж, товшиход гүйлгэнэ", () => {
  const hint = initScrollHint(bar);
  const moves: number[] = [];
  bar.scrollBy = ((options: ScrollToOptions) =>
    moves.push(options.left!)) as typeof bar.scrollBy;
  content = 700;
  bar.scrollLeft = 0;
  hint.sync();
  assert.deepEqual(shown(), ["end"]);
  assert.ok(bar.classList.contains("scroll-fade-end"));
  bar.scrollLeft = 400;
  hint.sync();
  assert.deepEqual(shown(), ["start"]);
  bar.scrollLeft = 200;
  hint.sync();
  assert.deepEqual(shown(), ["start", "end"]);
  arrows()[1]!.click();
  arrows()[0]!.click();
  assert.deepEqual(moves, [210, -210]);
  hint.destroy();
});

test("scrollHint: босоо дугуйг хэвтээ гүйлгэлт болгоно", () => {
  const hint = initScrollHint(bar);
  content = 700;
  bar.scrollLeft = 0;
  const wheel = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
  bar.dispatchEvent(wheel);
  assert.equal(bar.scrollLeft, 120);
  assert.equal(wheel.defaultPrevented, true);
  content = 300;
  const idle = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
  bar.dispatchEvent(idle);
  assert.equal(idle.defaultPrevented, false);
  hint.destroy();
});
