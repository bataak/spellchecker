import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom(
  '<div class="editor-wrap is-markdown"><div class="backdrop"></div><textarea class="editor"></textarea></div>',
);
let narrow = true;
(dom.window as unknown as { matchMedia: unknown }).matchMedia = () => ({
  get matches() {
    return narrow;
  },
  addEventListener: () => {},
});
const { initTableWrap } = await import("../src/editor/tablewrap.ts");
type Backdrop = import("../src/editor/backdrop.ts").Backdrop;

test.after(() => dom.close());

test("tableWrap: курсор хүснэгтэд орвол мөр таслалтыг унтрааж, гарахад сэргээнэ", () => {
  const wrap = document.querySelector<HTMLElement>(".editor-wrap")!;
  const editor = document.querySelector<HTMLTextAreaElement>("textarea")!;
  let synced = 0;
  const sync = initTableWrap({
    editor,
    backdrop: { rangeRectAt: () => null } as unknown as Backdrop,
    syncScroll: () => (synced += 1),
  });
  editor.value = "Догол\n\n| а | б |\n|---|---|\n";
  editor.focus();
  editor.setSelectionRange(1, 1);
  sync();
  assert.equal(wrap.classList.contains("is-table-line"), false);
  editor.setSelectionRange(9, 9);
  sync();
  assert.equal(wrap.classList.contains("is-table-line"), true);
  editor.setSelectionRange(2, 2);
  sync();
  assert.equal(wrap.classList.contains("is-table-line"), false);
  assert.equal(synced, 2);

  editor.setSelectionRange(9, 9);
  narrow = false;
  sync();
  assert.equal(wrap.classList.contains("is-table-line"), false);
  narrow = true;
  wrap.classList.remove("is-markdown");
  sync();
  assert.equal(wrap.classList.contains("is-table-line"), false);
});
