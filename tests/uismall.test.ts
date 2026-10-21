import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<button id="themeBtn"></button><button id="fontIncBtn"></button>' +
    '<button id="fontDecBtn"></button><button id="fontResetBtn"></button>' +
    '<button id="reportBtn"></button><p id="reportNote" hidden></p>' +
    '<div id="body"></div>',
);
let dark = false;
Object.assign(dom.window, {
  matchMedia: () => ({ matches: dark }),
});

const { initAppearance } = await import("../src/ui/appearance.ts");
const { onDoubleTap } = await import("../src/preview/previewgesture.ts");
const { keepScrollX } = await import("../src/preview/panescroll.ts");
const { initReportButton } = await import("../src/feedback/reportbtn.ts");

test.after(() => dom.close());

const root = (): HTMLElement => document.documentElement;
const click = (id: string): void =>
  document.querySelector<HTMLElement>("#" + id)!.click();
const scale = (): string => root().style.getPropertyValue("--editor-scale");

test("appearance: системийн бараан горимыг дагаж, товчоор сольж хадгална", () => {
  resetStorage();
  dark = true;
  initAppearance();
  assert.equal(root().getAttribute("data-theme"), "dark");
  click("themeBtn");
  assert.equal(root().getAttribute("data-theme"), "light");
  assert.equal(localStorage.getItem("theme"), "light");
});

test("appearance: үсгийн хэмжээг 0.8–1.8 хооронд барьж хадгална", () => {
  resetStorage();
  localStorage.setItem("mn-spell:scale", "1.75");
  initAppearance();
  assert.equal(scale(), "1.75");
  click("fontIncBtn");
  click("fontIncBtn");
  assert.equal(scale(), "1.8");
  click("fontResetBtn");
  assert.equal(scale(), "1");
  for (let i = 0; i < 5; i++) click("fontDecBtn");
  assert.equal(scale(), "0.8");
  assert.equal(localStorage.getItem("mn-spell:scale"), "0.8");
});

function pointer(type: string, x: number, at: number, id = 1): Event {
  const event = new PointerEvent(type, {
    clientX: x,
    clientY: 10,
    pointerId: id,
    pointerType: "touch",
    isPrimary: true,
  });
  Object.defineProperty(event, "timeStamp", { value: at });
  return event;
}

test("previewgesture: ойрхон хоёр товшилтыг давхар товшилт гэж үзнэ", () => {
  const body = document.querySelector<HTMLElement>("#body")!;
  const jumps: number[] = [];
  const off = onDoubleTap(body, (x) => jumps.push(x));
  body.dispatchEvent(pointer("pointerdown", 10, 0));
  body.dispatchEvent(pointer("pointerup", 10, 50));
  body.dispatchEvent(pointer("pointerdown", 12, 150));
  body.dispatchEvent(pointer("pointerup", 12, 200));
  assert.deepEqual(jumps, [12]);
  body.dispatchEvent(pointer("pointerdown", 10, 1000));
  body.dispatchEvent(pointer("pointerup", 40, 1050));
  body.dispatchEvent(pointer("pointerdown", 40, 1100));
  body.dispatchEvent(pointer("pointercancel", 40, 1120));
  body.dispatchEvent(pointer("pointerup", 40, 1150));
  assert.deepEqual(jumps, [12]);
  off();
  body.dispatchEvent(new MouseEvent("dblclick", { button: 0, clientX: 5 }));
  assert.deepEqual(jumps, [12]);
});

test("previewgesture: хулганы давхар товшилтыг шууд дамжуулна", () => {
  const body = document.querySelector<HTMLElement>("#body")!;
  const jumps: number[] = [];
  const off = onDoubleTap(body, (x) => jumps.push(x));
  body.dispatchEvent(new MouseEvent("dblclick", { button: 0, clientX: 7 }));
  body.dispatchEvent(new MouseEvent("dblclick", { button: 2, clientX: 8 }));
  assert.deepEqual(jumps, [7]);
  off();
});

function scroller(): HTMLElement {
  const body = document.createElement("div");
  Object.defineProperty(body, "scrollWidth", { value: 1000 });
  Object.defineProperty(body, "clientWidth", { value: 600 });
  return body;
}

test("panescroll: хэвтээ гүйлгэлтийн харьцааг хадгалж, сэргээнэ", () => {
  resetStorage();
  const body = scroller();
  let tracking = true;
  keepScrollX(body, () => tracking);
  body.scrollLeft = 200;
  body.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(localStorage.getItem("pdfScrollX"), "0.5");
  tracking = false;
  body.scrollLeft = 0;
  body.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(localStorage.getItem("pdfScrollX"), "0.5");
  const next = scroller();
  keepScrollX(next, () => true)();
  assert.equal(next.scrollLeft, 200);
});

test("reportbtn: offline үед тайлбар харуулж, цонх нээхгүй", () => {
  const opened: unknown[] = [];
  Object.assign(dom.window, {
    open: (...args: unknown[]) => {
      opened.push(args);
      return null;
    },
  });
  const note = document.querySelector<HTMLElement>("#reportNote")!;
  let snapshots = 0;
  initReportButton(() => {
    snapshots++;
    return {} as never;
  });
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  click("reportBtn");
  assert.equal(note.hidden, false);
  assert.equal(opened.length, 0);
  window.dispatchEvent(new Event("online"));
  assert.equal(note.hidden, true);
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  click("reportBtn");
  assert.deepEqual(opened, [["", "_blank"]]);
  assert.equal(snapshots, 1);
});
