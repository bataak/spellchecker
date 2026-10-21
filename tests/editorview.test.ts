import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea>');
const resized: (() => void)[] = [];
Object.assign(globalThis, {
  ResizeObserver: class {
    constructor(run: () => void) {
      resized.push(run);
    }
    observe(): void {}
  },
});

const { createEditorView, bindLineBlocks } =
  await import("../src/app/editorview.ts");

test.after(() => dom.close());

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function setup(rects: Record<number, DOMRect | null> = {}) {
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  editor.value = "нэг\nхоёр\nгурав\nдөрөв\nтав";
  for (const [name, value] of [
    ["clientHeight", 100],
    ["scrollHeight", 1000],
  ] as const)
    Object.defineProperty(editor, name, { value, configurable: true });
  editor.getBoundingClientRect = () => new DOMRect(0, 0, 300, 100);
  const calls: string[] = [];
  let anchored: number | null = null;
  const backdrop = {
    el: document.createElement("div"),
    setActiveLine: (line: number) => calls.push("active:" + line),
    refreshMarks: () => calls.push("refresh"),
    captureTopAnchor: () => calls.push("capture"),
    anchoredScrollTop: () => anchored,
    rangeRectAt: (start: number) => rects[start] ?? null,
    offsetAtY: (y: number) => Math.round(y),
    setLineBlocks: (on: boolean) => calls.push("blocks:" + on),
    reset: () => calls.push("reset"),
  };
  const lines: number[] = [];
  const tokens = [{ start: 4, end: 8, word: "хоёр" }];
  const view = createEditorView({
    editor,
    backdrop: backdrop as never,
    marks: () => ({ tokens: () => tokens }) as never,
    onLine: (line) => lines.push(line),
    onScroll: () => calls.push("scroll"),
  });
  return {
    editor,
    backdrop,
    calls,
    lines,
    view,
    anchor: (top: number | null) => (anchored = top),
  };
}

test("editorview: курсорын мөрийг нэг frame-д нэг удаа тэмдэглэнэ", async () => {
  const { editor, calls, lines } = setup();
  editor.setSelectionRange(9, 9);
  editor.dispatchEvent(new Event("click"));
  editor.dispatchEvent(new Event("keyup"));
  await frame();
  assert.deepEqual(lines, [2]);
  assert.deepEqual(calls, ["active:2"]);
});

test("editorview: гүйлгэхэд backdrop-ыг дагуулж, хэмжээ өөрчлөгдөхөд байрлалыг сэргээнэ", () => {
  const { editor, backdrop, calls, anchor } = setup();
  editor.scrollTop = 40;
  editor.dispatchEvent(new Event("scroll"));
  assert.equal(backdrop.el.scrollTop, 40);
  assert.deepEqual(calls, ["capture", "scroll"]);
  anchor(70);
  resized.at(-1)!();
  assert.equal(editor.scrollTop, 70);
  assert.equal(backdrop.el.scrollTop, 70);
});

test("editorview: харагдахгүй хүрээ уруу гүйлгэж, харагдаж буйг хөдөлгөхгүй", () => {
  const { editor, view } = setup({ 20: new DOMRect(0, 500, 10, 16) });
  editor.scrollTop = 0;
  view.revealRange(20, 25);
  assert.equal(editor.selectionStart, 20);
  assert.equal(editor.scrollTop, 470);
  view.revealRange(4, 8);
  assert.equal(editor.scrollTop, 170);
  view.revealRange(5, 6);
  assert.equal(editor.scrollTop, 170);
  editor.scrollTop = 0;
  view.revealRange(0, 0);
  assert.equal(editor.scrollTop, 0);
});

test("editorview: курсор харагдвал түүнийг, үгүй бол дэлгэцийн дээд хэсгийг буцаана", () => {
  const visible = setup({ 9: new DOMRect(0, 20, 10, 16) });
  visible.editor.setSelectionRange(9, 9);
  assert.equal(visible.view.visibleOffset(), 9);
  const hidden = setup({ 9: new DOMRect(0, 300, 10, 16) });
  hidden.editor.setSelectionRange(9, 9);
  assert.equal(hidden.view.visibleOffset(), 35);
});

test("editorview: курсор алдаатай үг дотор байвал тэр үгийг буцаана", () => {
  const { editor, view } = setup();
  editor.setSelectionRange(6, 6);
  assert.equal(view.tokenAtCaret()?.word, "хоёр");
  editor.setSelectionRange(0, 0);
  assert.equal(view.tokenAtCaret(), null);
});

test("bindLineBlocks: нарийн дэлгэц дээр мөрийн блокийг унтрааж дахин зурна", () => {
  const { backdrop, calls } = setup();
  let change = (): void => {};
  const narrow = {
    matches: false,
    addEventListener: (_: string, run: () => void) => (change = run),
  };
  let renders = 0;
  bindLineBlocks(backdrop as never, narrow as never, () => renders++);
  narrow.matches = true;
  change();
  assert.deepEqual(calls, ["blocks:true", "blocks:false", "reset"]);
  assert.equal(renders, 1);
});
