import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea><div id="body"></div>');

const { createPreviewSync, previewShown } =
  await import("../src/preview/previewsync.ts");
const { pdfWords } = await import("../src/tex/texsync.ts");

test.after(() => dom.close());

const TEX = "\\begin{document}\nНэгдүгээр мөр.\n\nХоёрдугаар догол мөр.\n";
const PDF = pdfWords(
  [
    [
      { text: "Нэгдүгээр мөр.", y: 700 },
      { text: "Хоёрдугаар догол мөр.", y: 680 },
    ],
  ],
  [800],
);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function setup(tex: boolean) {
  const area = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const body = document.querySelector<HTMLElement>("#body")!;
  area.value = tex ? TEX : "нэг\nхоёр\nгурав";
  const calls: string[] = [];
  const view = {
    words: async () => PDF,
    reveal: (page: number, y: number) =>
      calls.push("reveal:" + page + ":" + y.toFixed(3)),
    pointAt: (x: number) => (x < 0 ? null : { page: 1, x: 0.05, y: 0.15 }),
  };
  let shownView: typeof view | null = tex ? view : null;
  let pending = false;
  const sync = createPreviewSync({
    area,
    body,
    view: () => shownView as never,
    htmlSync: {
      revealLine: (line: number) => calls.push("line:" + line),
      jumpFrom: (x: number) => calls.push("from:" + x),
    } as never,
    texActive: () => tex,
    texPending: () => pending,
    htmlShown: () => true,
    jump: (start, end) => calls.push("jump:" + start + "-" + end),
  });
  return {
    area,
    body,
    calls,
    sync,
    hide: () => (shownView = null),
    pend: (on: boolean) => (pending = on),
  };
}

const showPreview = (on: boolean): void => {
  if (on) document.documentElement.dataset.preview = "on";
  else delete document.documentElement.dataset.preview;
};

test("previewsync: харагдац нээлттэй үед markdown-ийн мөр уруу гүйлгэнэ", async () => {
  const { area, body, calls, sync } = setup(false);
  showPreview(false);
  assert.equal(previewShown(), false);
  sync.reveal(5);
  await sync.flush();
  assert.deepEqual(calls, []);
  showPreview(true);
  area.dataset.layout = "b";
  await sync.flush();
  assert.deepEqual(calls, ["line:1"]);
  assert.equal(body.dataset.layout, "b");
  await sync.flush();
  assert.deepEqual(calls, ["line:1"]);
  delete area.dataset.layout;
  sync.destroy();
});

test("previewsync: курсор хөдлөхөд хүлээгээд, бичиж байх үед удаан хүлээнэ", async () => {
  const { area, calls, sync } = setup(false);
  showPreview(true);
  area.focus();
  area.setSelectionRange(9, 9);
  document.dispatchEvent(new Event("selectionchange"));
  await wait(300);
  assert.deepEqual(calls, ["line:2"]);
  document.dispatchEvent(new Event("selectionchange"));
  await wait(300);
  assert.deepEqual(calls, ["line:2"]);
  area.dispatchEvent(new Event("input"));
  area.setSelectionRange(0, 0);
  document.dispatchEvent(new Event("selectionchange"));
  await wait(300);
  assert.deepEqual(calls, ["line:2"]);
  sync.shown();
  sync.destroy();
});

test("previewsync: LaTeX үед PDF дээрх тохирох байрлалыг харуулна", async () => {
  const { area, calls, sync, hide } = setup(true);
  showPreview(true);
  sync.reveal(area.value.indexOf("Хоёрдугаар"));
  await sync.flush();
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^reveal:1:/);
  hide();
  sync.reveal(0);
  await sync.flush();
  assert.equal(calls.length, 1);
  sync.destroy();
});

test("previewsync: PDF дээр давхар товшиход эх бичвэрийн үг уруу үсэрнэ", async () => {
  const { area, calls, sync } = setup(true);
  sync.jumpAt(10, 10, null);
  await wait(20);
  const at = area.value.indexOf("Хоёрдугаар");
  assert.deepEqual(calls, ["jump:" + at + "-" + (at + "Хоёрдугаар".length)]);
  sync.jumpAt(-1, 0, null);
  await wait(20);
  assert.equal(calls.length, 1);
  sync.destroy();
});

test("previewsync: markdown дээр давхар товшиход зураг, холбоосоос бусад үед үсэрнэ", () => {
  const { calls, sync } = setup(false);
  const link = document.createElement("a");
  sync.jumpAt(3, 4, link);
  sync.jumpAt(3, 4, document.createElement("p"));
  assert.deepEqual(calls, ["from:3"]);
  sync.destroy();
});
