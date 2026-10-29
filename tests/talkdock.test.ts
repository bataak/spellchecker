import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import { initTalk } from "../src/collab/talkhost.ts";

const dom = installDom(
  '<aside class="project-panel" hidden><div class="project-head"></div>' +
    '<div class="project-tree"></div><div class="project-foot">' +
    '<button class="project-foot-btn">Архивлах</button></div></aside>' +
    '<div class="workspace"><div class="editor-wrap">' +
    '<textarea id="editor"></textarea></div></div><button id="collabBtn"></button>',
);
(globalThis as Record<string, unknown>).requestAnimationFrame = (
  run: () => void,
) => setTimeout(run, 0);
test.after(() => dom.close());

const wait = (ms = 20): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function comment(editor: HTMLTextAreaElement): Promise<void> {
  editor.focus();
  editor.setSelectionRange(0, 4);
  document.dispatchEvent(new Event("selectionchange"));
  await wait();
  const button = document.querySelector<HTMLButtonElement>(
    ".collab-comment-btn",
  )!;
  assert.equal(button.hidden, false);
  button.click();
}

test("самбар хаалттай үед төслийн шүүмжийг хөвөгч цонхонд нээнэ", async () => {
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  editor.value = "Сайн уу байна";
  const panel = document.querySelector<HTMLElement>(".project-panel")!;
  initTalk({
    picking: () => false,
    collab: { talk: () => null, onTalk: () => {} },
    editor,
    openPath: () => {},
    view: {
      host: document.querySelector(".editor-wrap")!,
      rangeRects: () => [new DOMRect(10, 10, 40, 16)],
      onRender: () => () => {},
    },
    doc: () => ({ kind: "project", key: "p1", path: "main.tex" }),
    profile: () => ({ name: "Би", color: 1 }),
    notes: {
      load: () => Promise.resolve(null),
      save: () => Promise.resolve(),
      drop: () => Promise.resolve(),
    },
    anchor: document.querySelector("#collabBtn"),
    workspace: document.querySelector(".workspace"),
    editorWrap: document.querySelector(".editor-wrap"),
  });
  const win = document.querySelector<HTMLElement>(".talk-window")!;

  await comment(editor);
  assert.equal(win.hidden, false);
  assert.ok(win.querySelector(".talk-compose:not([hidden])"));
  assert.equal(panel.hidden, true);

  panel.hidden = false;
  await wait();
  assert.equal(win.hidden, true);
  assert.equal(panel.classList.contains("is-talk"), false);

  await comment(editor);
  assert.ok(panel.classList.contains("is-talk"));
  assert.ok(panel.querySelector(".project-talk .talk-compose:not([hidden])"));
  assert.equal(win.hidden, true);
});
