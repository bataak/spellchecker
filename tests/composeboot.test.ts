import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { installDom } from "./helpers/dom.ts";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const body = html.slice(html.indexOf("<body"), html.lastIndexOf("</body>"));
const shell = body.slice(body.indexOf(">") + 1);
const dom = installDom(shell);

const posted: unknown[] = [];
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(message: unknown): void {
    posted.push(message);
  }
  terminate(): void {}
}
const win = dom.window as unknown as Record<string, unknown>;
for (const name of Object.getOwnPropertyNames(win)) {
  if (name in globalThis || !/^[A-Z]/.test(name)) continue;
  Object.defineProperty(globalThis, name, {
    value: win[name],
    configurable: true,
    writable: true,
  });
}
const unref = <T>(handle: T): T => {
  (handle as { unref?: () => void }).unref?.();
  return handle;
};
const { setTimeout: later, setInterval: every } = globalThis;
class QuietChannel extends BroadcastChannel {
  constructor(name: string) {
    super(name);
    unref(this);
  }
}
Object.assign(globalThis, {
  setTimeout: (...args: Parameters<typeof later>) => unref(later(...args)),
  setInterval: (...args: Parameters<typeof every>) => unref(every(...args)),
  BroadcastChannel: QuietChannel,
  Worker: FakeWorker,
  matchMedia: dom.window.matchMedia.bind(dom.window),
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  location: dom.window.location,
  history: dom.window.history,
});

Object.defineProperty(document, "fonts", {
  value: {
    ready: Promise.resolve(),
    check: () => true,
    load: async () => [],
    addEventListener: () => {},
    [Symbol.iterator]: function* () {},
  },
  configurable: true,
});

const { createLate } = await import("../src/core/late.ts");
const { COMPOSERS, composeApp } = await import("../src/app/compose.ts");
type Parts = import("../src/app/appparts.ts").AppParts;

const PARTS = {
  entryUrl: true,
  projectStore: true,
  els: true,
  controls: true,
  layoutChanged: true,
  backdrop: true,
  view: true,
  checker: true,
  spell: true,
  dicts: true,
  lastCaret: true,
  markupMode: true,
  enterMdMode: true,
  status: true,
  editor: true,
  office: true,
  officeActive: true,
  doc: true,
  docStatus: true,
  docMode: true,
  isLatexText: true,
  isTexFile: true,
  texMode: true,
  marks: true,
  previewMode: true,
  emptyTips: true,
  syncEmptyState: true,
  loop: true,
  defDock: true,
  defTip: true,
  pop: true,
  errorPanel: true,
  editorText: true,
  fixFlow: true,
  fixers: true,
  draft: true,
  measureCtl: true,
  previewCtl: true,
  paneCtl: true,
  appUpdate: true,
  saveChain: true,
  fileIO: true,
  slots: true,
  mdBar: true,
  nudgeHints: true,
  projectLink: true,
  kbLayout: true,
  undoCtl: true,
  exportCtl: true,
  collab: true,
  tabGuard: true,
  dictionaries: true,
} satisfies Record<keyof Parts, true>;

test.after(() => dom.window.happyDOM.abort());

async function boot(): Promise<Parts> {
  const app = createLate<Parts>();
  app.provide({ entryUrl: "http://localhost/src/main.ts" });
  composeApp(app);
  return app;
}

test("compose: аппыг main.ts-ийн дарааллаар угсарч, бүх хэсгийг холбоно", async () => {
  const app = await boot();
  for (const name of Object.keys(PARTS) as (keyof Parts)[])
    assert.notEqual(app[name], undefined, name);
  assert.ok(COMPOSERS.length > 0);

  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  editor.value = "Монгол хэл";
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  await app.loop.render();
  assert.equal(app.isTexFile(), false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    posted.some((m) => (m as { type?: string }).type === "init"),
    "spell worker init",
  );
});

test("compose: хадгалсан тайлбарын самбарын байрлалтай угсрахад унахгүй", async () => {
  for (const place of ["left", "right", "panel", "panel-top"]) {
    document.body.innerHTML = shell;
    localStorage.setItem("def-dock", place);
    await assert.doesNotReject(boot, place);
  }
  localStorage.removeItem("def-dock");
});
