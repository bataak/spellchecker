import test from "node:test";
import assert from "node:assert/strict";

import { installDom } from "./helpers/dom.ts";

const dom = installDom('<textarea id="ed"></textarea><div id="bd"></div>');
Object.defineProperty(document, "fonts", {
  value: { ready: Promise.resolve() },
  configurable: true,
});
const { boot } = await import("../src/app/boot.ts");

test.after(() => dom.close());

test("boot: ноорог, файл, төслийг дарааллаар сэргээж, дараа нь толь эхлүүлнэ", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: string[] = [];
  const log = (name: string) => (): void => void calls.push(name);
  const editor = document.querySelector<HTMLTextAreaElement>("#ed")!;
  document.documentElement.classList.add("booting");
  await boot({
    editor,
    backdrop: document.querySelector<HTMLElement>("#bd")!,
    draft: {
      load: async () => log("draft")(),
      save: log("save"),
      saveSoon: log("saveSoon"),
      restoreBootScroll: log("scroll"),
      dropBootScroll: log("dropScroll"),
    },
    baseline: log("baseline"),
    restoreFile: async () => log("file")(),
    restoreProject: async () => log("project")(),
    restored: log("restored"),
    pruneUndo: log("prune"),
    fontsLoaded: log("fonts"),
    render: async () => log("render")(),
    nudge: log("nudge"),
    appUpdate: { recoverStale: async () => log("stale")() } as never,
    dictLife: {
      watchFatal: log("fatal"),
      start: async () => log("dicts")(),
    } as never,
    status: (message) => calls.push("status:" + message),
  });
  const order = calls.filter((c) =>
    ["draft", "baseline", "file", "project", "restored", "dicts"].includes(c),
  );
  assert.deepEqual(order, [
    "draft",
    "baseline",
    "file",
    "project",
    "restored",
    "dicts",
  ]);
  assert.ok(calls.includes("fatal"));
  assert.ok(calls.some((c) => c.startsWith("status:")));
  assert.equal(document.documentElement.classList.contains("booting"), false);
  editor.dispatchEvent(new Event("keydown"));
  assert.ok(calls.includes("dropScroll"));
});
