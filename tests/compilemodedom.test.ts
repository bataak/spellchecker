import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<button class="tex-compile"></button><textarea class="editor"></textarea>',
);
const {
  AUTO_TITLE,
  MANUAL_TITLE,
  autoDelay,
  initCompileButton,
  tooSlowForAuto,
} = await import("../src/preview/compilemode.ts");

test.after(() => dom.close());

const setup = () => {
  const button = document.querySelector<HTMLButtonElement>("button")!;
  const area = document.querySelector<HTMLTextAreaElement>("textarea")!;
  const calls: string[] = [];
  let auto = true;
  let active = true;
  const control = initCompileButton({
    button,
    area,
    active: () => active,
    auto: () => auto,
    compile: () => {
      calls.push("compile");
      auto = false;
      control.paint();
    },
    toAuto: () => {
      calls.push("auto");
      auto = true;
      control.paint();
    },
  });
  return {
    button,
    area,
    calls,
    control,
    setActive: (on: boolean) => {
      active = on;
    },
  };
};

const press = (button: HTMLButtonElement): void => {
  button.dispatchEvent(
    new dom.window.PointerEvent("pointerdown", {
      button: 0,
    }) as unknown as Event,
  );
};
const lift = (button: HTMLButtonElement): void => {
  button.dispatchEvent(
    new dom.window.PointerEvent("pointerup") as unknown as Event,
  );
  button.click();
};
const key = (
  area: HTMLTextAreaElement,
  init: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean },
): KeyboardEvent => {
  const event = new dom.window.KeyboardEvent("keydown", {
    key: "Enter",
    cancelable: true,
    ...init,
  }) as unknown as KeyboardEvent;
  area.dispatchEvent(event);
  return event;
};

test("compileButton: авто горимыг тэмдэглэж, товшилтоор гар горимд хөрвүүлнэ", () => {
  const { button, calls, control } = setup();
  assert.equal(button.classList.contains("is-auto"), true);
  assert.equal(button.getAttribute("aria-label"), AUTO_TITLE);
  press(button);
  lift(button);
  assert.deepEqual(calls, ["compile"]);
  assert.equal(button.classList.contains("is-auto"), false);
  assert.equal(button.title, MANUAL_TITLE);
  control.destroy();
});

test("compileButton: удаан дарвал авто горимд шилжиж, дараагийн click-ийг залгина", async () => {
  const { button, calls, control } = setup();
  press(button);
  lift(button);
  press(button);
  await new Promise((resolve) => setTimeout(resolve, 650));
  lift(button);
  assert.deepEqual(calls, ["compile", "auto"]);
  assert.equal(button.classList.contains("is-auto"), true);
  press(button);
  await new Promise((resolve) => setTimeout(resolve, 100));
  lift(button);
  assert.deepEqual(calls, ["compile", "auto", "compile"]);
  control.destroy();
});

test("compileButton: Ctrl+Enter хөрвүүлж, Ctrl+Shift+Enter авто горимд шилжүүлнэ", () => {
  const { area, calls, control, setActive } = setup();
  assert.equal(key(area, { ctrlKey: true }).defaultPrevented, true);
  key(area, { ctrlKey: true, shiftKey: true });
  key(area, {});
  key(area, { ctrlKey: true, altKey: true });
  setActive(false);
  assert.equal(key(area, { ctrlKey: true }).defaultPrevented, false);
  assert.deepEqual(calls, ["compile", "auto"]);
  control.destroy();
});

test("compileButton: өөр сонсогч Enter-ийг аваад авсан бол хөрвүүлэхгүй", () => {
  const { area, calls, control } = setup();
  const grab = (event: Event): void => event.preventDefault();
  area.addEventListener("keydown", grab, { capture: true });
  key(area, { ctrlKey: true });
  area.removeEventListener("keydown", grab, { capture: true });
  assert.deepEqual(calls, []);
  control.destroy();
});

test("autoDelay ба tooSlowForAuto: хүлээлт compile-ийн хугацаанд тохирч, 15с-ээс удаан бол автоматыг зогсооно", () => {
  assert.equal(autoDelay(0), 2000);
  assert.equal(autoDelay(800), 2000);
  assert.equal(autoDelay(9000), 9000);
  assert.equal(tooSlowForAuto(14000, false), false);
  assert.equal(tooSlowForAuto(16000, false), true);
  assert.equal(tooSlowForAuto(40000, true), false);
});
