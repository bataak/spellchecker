import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBlobSwap,
  PART_BYTES,
  parsePart,
  partFrame,
  SwapClosed,
  type BlobSwap,
} from "../src/collab/blobswap.ts";
import { decodeFrame, type BlobKind } from "../src/collab/wire.ts";
import { blobHash, MAX_BLOB } from "../src/collab/projectdoc.ts";

interface Node {
  readonly id: string;
  readonly swap: BlobSwap;
  readonly sent: { to: string; kind: number }[];
}

function network(stores: Record<string, Map<string, Uint8Array>>): {
  nodes: Map<string, Node>;
  settle(): Promise<void>;
} {
  const nodes = new Map<string, Node>();
  let pending: Promise<unknown> = Promise.resolve();
  for (const id of Object.keys(stores)) {
    const sent: Node["sent"] = [];
    const swap = createBlobSwap({
      transport: {
        open: () => [...nodes.keys()].filter((peer) => peer !== id),
        drain: async () => {},
        send(to, data) {
          const frame = decodeFrame(data)!;
          sent.push({ to, kind: frame.kind });
          pending = pending.then(() =>
            nodes.get(to)?.swap.receive(id, frame.kind as BlobKind, frame.body),
          );
        },
      },
      have: async (hash) => stores[id]!.get(hash) ?? null,
    });
    nodes.set(id, { id, swap, sent });
  }
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 50; round++) {
      await pending;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { nodes, settle };
}

function bytesOf(size: number, seed = 1): Uint8Array {
  const out = new Uint8Array(size);
  for (let index = 0; index < size; index++) out[index] = (index * seed) % 251;
  return out;
}

test("a large blob crosses in several parts and arrives whole", async () => {
  const bytes = bytesOf(PART_BYTES * 2 + 123, 7);
  const hash = await blobHash(bytes);
  const { nodes, settle } = network({
    a: new Map([[hash, bytes]]),
    b: new Map(),
  });
  const got = nodes.get("b")!.swap.want(hash, bytes.byteLength);
  await settle();
  assert.deepEqual(await got, bytes);
  const parts = nodes.get("a")!.sent.filter((item) => item.kind === 5);
  assert.equal(parts.length, 3);
  nodes.forEach((node) => node.swap.close());
});

test("a peer without the blob says so and the next peer is asked", async () => {
  const bytes = bytesOf(1000, 3);
  const hash = await blobHash(bytes);
  const { nodes, settle } = network({
    b: new Map(),
    c: new Map(),
    d: new Map([[hash, bytes]]),
  });
  const got = nodes.get("b")!.swap.want(hash, bytes.byteLength);
  await settle();
  assert.deepEqual(await got, bytes);
  assert.ok(nodes.get("c")!.sent.some((item) => item.kind === 6));
  nodes.forEach((node) => node.swap.close());
});

test("bytes that do not match the hash are refused", async () => {
  const bytes = bytesOf(500, 5);
  const hash = await blobHash(bytes);
  const { nodes, settle } = network({
    b: new Map(),
    c: new Map([[hash, bytesOf(500, 9)]]),
    d: new Map([[hash, bytes]]),
  });
  const got = nodes.get("b")!.swap.want(hash, bytes.byteLength);
  await settle();
  assert.deepEqual(await got, bytes);
  nodes.forEach((node) => node.swap.close());
});

test("the same wanted hash shares one request", async () => {
  const bytes = bytesOf(10);
  const hash = await blobHash(bytes);
  const { nodes, settle } = network({
    a: new Map([[hash, bytes]]),
    b: new Map(),
  });
  const first = nodes.get("b")!.swap.want(hash, 10);
  assert.equal(nodes.get("b")!.swap.want(hash, 10), first);
  await settle();
  assert.deepEqual(await first, bytes);
  assert.equal(nodes.get("b")!.sent.filter((s) => s.kind === 4).length, 1);
  nodes.forEach((node) => node.swap.close());
});

test("a wanted blob waits for a peer to join", async () => {
  const bytes = bytesOf(64);
  const hash = await blobHash(bytes);
  const open: string[] = [];
  const sent: string[] = [];
  const swap = createBlobSwap({
    transport: {
      open: () => open,
      drain: async () => {},
      send: (to) => void sent.push(to),
    },
    have: async () => null,
  });
  const pending = swap.want(hash, 64);
  assert.deepEqual(sent, []);
  open.push("x");
  swap.joined("x");
  assert.deepEqual(sent, ["x"]);
  swap.close();
  await assert.rejects(pending, SwapClosed);
  await assert.rejects(swap.want(hash, 64), SwapClosed);
});

test("bad hashes and oversized blobs are rejected", async () => {
  const { nodes } = network({ a: new Map() });
  const swap = nodes.get("a")!.swap;
  await assert.rejects(swap.want("nope", 1));
  await assert.rejects(swap.want("a".repeat(64), MAX_BLOB + 1));
  swap.close();
});

test("parts carry their place and malformed parts are dropped", () => {
  const hash = "f".repeat(64);
  const frame = partFrame(hash, 2, 3, new Uint8Array([9, 8]));
  const part = parsePart(frame.subarray(1));
  assert.deepEqual(part && { ...part, data: [...part.data] }, {
    hash,
    index: 2,
    total: 3,
    data: [9, 8],
  });
  assert.equal(parsePart(new Uint8Array(10)), null);
  assert.equal(
    parsePart(partFrame("x".repeat(64), 0, 1, new Uint8Array()).subarray(1)),
    null,
  );
  assert.equal(
    parsePart(partFrame(hash, 3, 3, new Uint8Array()).subarray(1)),
    null,
  );
});
