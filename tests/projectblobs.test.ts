import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createBlobBridge, type BlobPort } from "../src/collab/projectblobs.ts";
import {
  addBlob,
  blobHash,
  movePath,
  projectOf,
  removePath,
} from "../src/collab/projectdoc.ts";

const REMOTE = { peer: "x" };

interface FakePort {
  readonly port: BlobPort;
  readonly files: Map<string, Uint8Array>;
  readonly log: string[];
}

function fakePort(files: Map<string, Uint8Array> | null): FakePort {
  const store = files ?? new Map<string, Uint8Array>();
  const log: string[] = [];
  return {
    files: store,
    log,
    port: {
      binaries: () => (files ? store : null),
      main: () => "main.tex",
      async put(path, bytes) {
        log.push("put " + path);
        store.set(path, bytes);
      },
      async move(from, to) {
        log.push("move " + from + " " + to);
        store.set(to, store.get(from)!);
        store.delete(from);
      },
      async remove(path) {
        log.push("remove " + path);
        store.delete(path);
      },
    },
  };
}

const idle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

test("local images are written into the shared doc", async () => {
  const doc = new Y.Doc();
  const png = new Uint8Array([1, 2, 3]);
  const { port, files } = fakePort(new Map([["fig.png", png]]));
  const bridge = createBlobBridge(doc, port, () => Promise.reject());
  await bridge.start();
  await bridge.pushLocal();
  const ref = projectOf(doc).blobs.get("fig.png");
  assert.deepEqual(ref, { hash: await blobHash(png), size: 3 });
  assert.equal(await bridge.have(ref!.hash), png);
  const copy = png.slice();
  files.set("fig.png", copy);
  assert.equal(await bridge.have(ref!.hash), copy);
  bridge.stop();
});

test("a local rename moves the shared entry instead of re-adding", async () => {
  const doc = new Y.Doc();
  const png = new Uint8Array([4, 5]);
  const fake = fakePort(new Map([["a.png", png]]));
  const bridge = createBlobBridge(doc, fake.port, () => Promise.reject());
  await bridge.start();
  await bridge.pushLocal();
  fake.files.delete("a.png");
  fake.files.set("b.png", png);
  await bridge.pushLocal();
  assert.deepEqual([...projectOf(doc).blobs.keys()], ["b.png"]);
  fake.files.delete("b.png");
  await bridge.pushLocal();
  assert.equal(projectOf(doc).blobs.size, 0);
  bridge.stop();
});

test("remote images are fetched, moved and removed locally", async () => {
  const doc = new Y.Doc();
  const png = new Uint8Array([7, 7, 7]);
  const hash = await blobHash(png);
  const fake = fakePort(new Map());
  const asked: string[] = [];
  const bridge = createBlobBridge(doc, fake.port, async (h) => {
    asked.push(h);
    return png;
  });
  await bridge.start();
  doc.transact(() => addBlob(doc, "fig.png", { hash, size: 3 }), REMOTE);
  await idle();
  assert.deepEqual(asked, [hash]);
  assert.equal(fake.files.get("fig.png"), png);
  doc.transact(() => movePath(doc, "fig.png", "img/fig.png"), REMOTE);
  await idle();
  assert.ok(fake.files.has("img/fig.png"));
  doc.transact(() => removePath(doc, "img/fig.png"), REMOTE);
  await idle();
  assert.deepEqual(fake.log, [
    "put fig.png",
    "move fig.png img/fig.png",
    "remove img/fig.png",
  ]);
  bridge.stop();
});

test("an image already held locally is copied without asking peers", async () => {
  const doc = new Y.Doc();
  const png = new Uint8Array([3, 1]);
  const hash = await blobHash(png);
  const fake = fakePort(new Map([["old.png", png]]));
  addBlob(doc, "new.png", { hash, size: 2 });
  const bridge = createBlobBridge(doc, fake.port, () =>
    Promise.reject(new Error("asked")),
  );
  await bridge.start();
  assert.equal(fake.files.get("new.png"), png);
  bridge.stop();
});

test("a fetched blob is dropped when the doc moved on meanwhile", async () => {
  const doc = new Y.Doc();
  const png = new Uint8Array([9]);
  const hash = await blobHash(png);
  const fake = fakePort(new Map());
  let release: (bytes: Uint8Array) => void = () => {};
  const bridge = createBlobBridge(
    doc,
    fake.port,
    () => new Promise((resolve) => (release = resolve)),
  );
  await bridge.start();
  doc.transact(() => addBlob(doc, "fig.png", { hash, size: 1 }), REMOTE);
  await idle();
  doc.transact(() => removePath(doc, "fig.png"), REMOTE);
  await idle();
  release(png);
  await idle();
  assert.equal(fake.files.size, 0);
  bridge.stop();
});

test("without a local project nothing is touched", async () => {
  const doc = new Y.Doc();
  const fake = fakePort(null);
  addBlob(doc, "fig.png", { hash: "a".repeat(64), size: 1 });
  const bridge = createBlobBridge(doc, fake.port, () => Promise.reject());
  await bridge.start();
  await bridge.pushLocal();
  assert.deepEqual(fake.log, []);
  assert.equal(await bridge.have("a".repeat(64)), null);
  bridge.stop();
});

test("at start the shared version wins over a stale local image", async () => {
  const doc = new Y.Doc();
  const fresh = new Uint8Array([1, 1]);
  const hash = await blobHash(fresh);
  addBlob(doc, "fig.png", { hash, size: 2 });
  const fake = fakePort(new Map([["fig.png", new Uint8Array([2, 2])]]));
  const bridge = createBlobBridge(doc, fake.port, async () => fresh);
  await bridge.start();
  await idle();
  assert.equal(projectOf(doc).blobs.get("fig.png")?.hash, hash);
  assert.equal(fake.files.get("fig.png"), fresh);
  bridge.stop();
});
