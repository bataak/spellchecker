import "fake-indexeddb/auto";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import type { createRegistry as Create } from "../src/collab/registry.ts";

const dom = installDom("<textarea></textarea>");
const target = globalThis as Record<string, unknown>;
target.window = dom.window;
const nativeTimeout = globalThis.setTimeout;
target.setTimeout = (run: () => void, ms?: number) => {
  const timer = nativeTimeout(run, ms);
  if ((ms ?? 0) >= 60_000) timer.unref();
  return timer;
};
const sockets: QuietSocket[] = [];
class QuietSocket {
  static readonly OPEN = 1;
  readyState = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    sockets.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
}
const savedSocket = target.WebSocket;
target.WebSocket = QuietSocket;
after(async () => {
  target.WebSocket = savedSocket;
  target.setTimeout = nativeTimeout;
  await dom.close();
});

test("эхэлж буй өрөөг хаавал зогссон сешн үлдэхгүй", async () => {
  target.__VITE_ENV__ = {
    BASE_URL: "/",
    VITE_COLLAB_URL: "http://127.0.0.1:9",
  };
  const { createRegistry } = (await import("../src/collab/registry.ts")) as {
    createRegistry: typeof Create;
  };
  await import("../src/collab/session.ts");
  const registry = createRegistry(
    document.querySelector("textarea")!,
    {
      host: document.createElement("div"),
      caretRect: () => null,
      rangeRects: () => [],
      onRender: () => () => {},
    },
    {
      project: null,
      changed: () => {},
      notify: () => {},
      access: () => null,
      granted: () => {},
      ended: () => {},
    },
  );
  const room = "closing-room";
  const opening = registry.open(
    {
      room,
      key: "k".repeat(22),
      slot: room,
      access: { kind: "o", token: "t".repeat(22) },
    },
    false,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  registry.close(room);
  const started = await opening.then(
    () => true,
    () => false,
  );
  assert.equal(started, true);
  assert.equal(registry.live(room), null);
  assert.ok(sockets.every((socket) => socket.readyState === 3));
});
