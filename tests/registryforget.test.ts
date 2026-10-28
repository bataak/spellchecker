import "fake-indexeddb/auto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { appendLog, loadLog, logKey, saveDoc } from "../src/collab/docstore.ts";
import { createRegistry } from "../src/collab/registry.ts";
import { installDom } from "./helpers/dom.ts";

const dom = installDom("<textarea></textarea>");
(globalThis as Record<string, unknown>).window = dom.window;
const nativeTimeout = globalThis.setTimeout;
(globalThis as Record<string, unknown>).setTimeout = (
  run: () => void,
  ms?: number,
) => nativeTimeout(run, ms).unref();
after(async () => {
  globalThis.setTimeout = nativeTimeout;
  await dom.close();
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => nativeTimeout(resolve, ms));

test("сешн нь эхлээгүй өрөөг мартахад хадгалсан өгөгдөл устана", async () => {
  await saveDoc("idle-room", new Uint8Array([1, 2, 3]));
  await appendLog(logKey("idle-room"), new Uint8Array([4]));
  const registry = createRegistry(
    document.querySelector("textarea")!,
    {
      host: {} as HTMLElement,
      caretRect: () => null,
      rangeRects: () => [],
      onRender: () => () => {},
    },
    { changed: () => {}, notify: () => {} } as unknown as Parameters<
      typeof createRegistry
    >[2],
  );
  registry.close("idle-room");
  await wait(50);
  const log = await loadLog("idle-room");
  assert.equal(log.base, null);
  assert.equal(log.updates.length, 0);
});
