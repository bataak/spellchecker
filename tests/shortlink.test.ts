import { test } from "node:test";
import assert from "node:assert/strict";

import {
  importKey,
  newLink,
  newToken,
  seal,
  toBase64Url,
} from "../src/collab/collabkey.ts";
import { resolveShort } from "../src/collab/shortlink.ts";

class FakeSocket {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close(): void {}
}

const SLOW_MS = 120;

test("хариуг тайлж дуусахаас өмнө холболт хаагдсан ч холбоосыг буцаана", async () => {
  const { room, key } = newLink();
  const invite = newToken();
  const sealed = await seal(
    await importKey(key),
    new TextEncoder().encode("тэмдэглэл.md"),
  );
  const subtle = crypto.subtle;
  const realImport = subtle.importKey.bind(subtle);
  const slowImport = (async (...args: Parameters<typeof realImport>) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return realImport(...args);
  }) as typeof subtle.importKey;
  const socket = new FakeSocket();
  subtle.importKey = slowImport;
  try {
    const pending = resolveShort(
      "https://collab.test",
      { code: "abcdefgh", key },
      () => socket as unknown as WebSocket,
    );
    socket.onmessage?.({
      data: JSON.stringify({
        t: "link",
        room,
        invite,
        name: toBase64Url(sealed),
      }),
    });
    socket.onclose?.();
    assert.deepEqual(await pending, {
      room,
      key,
      invite,
      name: "тэмдэглэл.md",
    });
  } finally {
    delete (subtle as { importKey?: unknown }).importKey;
  }
});

test("хариугүй хаагдсан холболтод null буцаана", async () => {
  const socket = new FakeSocket();
  const pending = resolveShort(
    "https://collab.test",
    { code: "abcdefgh", key: newLink().key },
    () => socket as unknown as WebSocket,
  );
  socket.onclose?.();
  assert.equal(await pending, null);
});
