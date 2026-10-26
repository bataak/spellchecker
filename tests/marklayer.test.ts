import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<div><textarea id="ed"></textarea></div>');
globalThis.matchMedia = dom.window.matchMedia.bind(
  dom.window,
) as unknown as typeof matchMedia;
const { createMarkLayer } = await import("../src/editor/marklayer.ts");
const { createLastCaret } = await import("../src/app/lastcaret.ts");

test.after(() => dom.close());

function fake() {
  let shown = "";
  const renders: { text: string; starts: number[] }[] = [];
  const backdrop = {
    render(text: string, tokens: { start: number }[]) {
      shown = text;
      renders.push({ text, starts: tokens.map((t) => t.start) });
    },
    text: () => shown,
    setHighlighter: () => {},
  };
  return { backdrop, renders };
}

const tok = (word: string, start: number) => ({
  word,
  start,
  end: start + word.length,
});

test("marklayer: засварын дараа алдааны байрлалыг шилжүүлнэ", () => {
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  const { backdrop, renders } = fake();
  let scrolls = 0;
  const layer = createMarkLayer({
    editor,
    backdrop: backdrop as never,
    syncScroll: () => scrolls++,
    texHighlighter: () => [],
  });
  layer.show("аа бб вв", [tok("аа", 0), tok("бб", 3), tok("вв", 6)]);
  layer.shift("аа ббX вв", { start: 5, oldEnd: 5, newEnd: 6 });
  assert.deepEqual(renders.at(-1)!.starts, [0, 7]);
  layer.follow();
  assert.equal(layer.setTex(false), false);
  editor.value = "аа ббX вв";
  assert.equal(layer.setTex(true), true);
  assert.equal(layer.tex(), true);
  assert.ok(editor.parentElement!.classList.contains("is-tex"));
  layer.follow();
  editor.value = "Y аа ббX вв";
  layer.follow();
  assert.deepEqual(renders.at(-1)!.starts, [9]);
  const before = renders.length;
  layer.shift("z", { start: 0, oldEnd: 0, newEnd: 1 });
  assert.equal(renders.length, before);
  editor.value = "өөр";
  layer.setTex(false);
  assert.deepEqual(layer.tokens(), []);
  assert.equal(scrolls, 3);
});

test("lastcaret: сүүлийн курсорыг хадгална", () => {
  const caret = createLastCaret();
  assert.equal(caret.get(), null);
  const spot = { start: 1, end: 2 } as never;
  caret.set(spot);
  assert.equal(caret.get(), spot);
});

test("emptystate: хоосон эсэхээр анги, тэмдэглэгээг сэлгэнэ", async () => {
  const { createEmptyState } = await import("../src/app/emptystate.ts");
  const el = document.createElement("div");
  let changed = 0;
  let cleared = 0;
  const update = createEmptyState({
    el,
    textChanged: () => changed++,
    cleared: () => cleared++,
  });
  update("бичвэр");
  assert.ok(el.classList.contains("is-hidden"));
  assert.equal(el.getAttribute("aria-hidden"), "true");
  assert.ok(document.documentElement.classList.contains("has-text"));
  update("");
  assert.ok(!el.classList.contains("is-hidden"));
  assert.ok(!document.documentElement.classList.contains("has-text"));
  createEmptyState({
    el: null,
    textChanged: () => changed++,
    cleared: () => cleared++,
  })("");
  assert.deepEqual([changed, cleared], [3, 2]);
});

test("app/dom: бүрхүүлийн элементүүдийг олж, дутвал алдаа өгнө", async () => {
  const { requireEl, nextFrame, queryShell } =
    await import("../src/app/dom.ts");
  assert.throws(() => requireEl("#none"), /missing element: #none/);
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="workspace"><div class="editor-wrap"></div></div><p id="statusText"></p><textarea id="editor"></textarea><div id="backdrop"></div><div id="popover"></div>',
  );
  (globalThis as { window?: unknown }).window ??= dom.window;
  const shell = queryShell();
  assert.equal(shell.editor.id, "editor");
  assert.equal(shell.emptyState, null);
  assert.equal(typeof shell.narrowMQ.matches, "boolean");
  await nextFrame();
});
