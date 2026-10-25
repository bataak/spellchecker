import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import NodeSocket from "ws";
import { startCollab, type CollabServer } from "./helpers/collabserver.ts";
import { ORIGIN } from "./helpers/collabpeer.ts";
import { newToken, randomId } from "../src/collab/collabkey.ts";
import {
  SNAPSHOT_PART,
  joinParts,
  snapshotParts,
  splitSnapshot,
} from "../src/collab/signal.ts";

let server: CollabServer;
before(async () => {
  server = await startCollab();
  await server.allow(ORIGIN);
});
after(() => server.close());

type Message = string | Uint8Array;

interface Client {
  readonly id: string;
  send(data: string | Uint8Array): void;
  next(): Promise<Message>;
  close(): void;
}

async function connect(
  room: string,
  dev: string,
  access: string,
): Promise<Client> {
  const id = randomId(12);
  const url =
    server.url.replace(/^http/, "ws") +
    "/room/" +
    room +
    "?d=" +
    dev +
    "&p=" +
    id +
    "&" +
    access;
  const ws = new NodeSocket(url, { headers: { Origin: ORIGIN } });
  const inbox: Message[] = [];
  const waiting: ((message: Message) => void)[] = [];
  ws.on("message", (data: Buffer, binary: boolean) => {
    const message = binary ? new Uint8Array(data) : data.toString();
    const wake = waiting.shift();
    if (wake) wake(message);
    else inbox.push(message);
  });
  await new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("open", resolve);
  });
  ws.on("error", () => {});
  const client: Client = {
    id,
    send: (data) => ws.send(data),
    next: () =>
      inbox.length
        ? Promise.resolve(inbox.shift()!)
        : new Promise((wake) => waiting.push(wake)),
    close: () => ws.terminate(),
  };
  await event(client, "hi");
  return client;
}

async function event(client: Client, type: string): Promise<unknown> {
  for (;;) {
    const message = await client.next();
    if (typeof message === "string" && JSON.parse(message).t === type)
      return JSON.parse(message);
  }
}

const digest = (list: readonly Uint8Array[]): string[] =>
  list.map((data) => createHash("sha256").update(data).digest("hex"));

function noise(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let at = 0; at < size; at += 65536)
    crypto.getRandomValues(out.subarray(at, Math.min(size, at + 65536)));
  return out;
}

async function upload(client: Client, data: Uint8Array): Promise<void> {
  const parts = splitSnapshot(data);
  if (parts.length > 1)
    client.send(JSON.stringify({ t: "snap", n: parts.length }));
  for (const part of parts) client.send(part);
}

async function settled(client: Client): Promise<void> {
  client.send(JSON.stringify({ t: "to", to: client.id, d: "ok" }));
  await event(client, "from");
}

async function stored(room: string, dev: string, owner: string) {
  const client = await connect(room, dev, "o=" + owner);
  client.send(JSON.stringify({ t: "to", to: client.id, d: "ok" }));
  const out: Uint8Array[] = [];
  let parts: Uint8Array[] = [];
  let want = 0;
  for (;;) {
    const message = await client.next();
    if (typeof message !== "string") {
      if (!want) out.push(message);
      else if (parts.push(message) === want) {
        out.push(joinParts(parts));
        parts = [];
        want = 0;
      }
      continue;
    }
    const n = snapshotParts(message);
    if (n !== null) want = n;
    else if (JSON.parse(message).t === "from") break;
  }
  client.close();
  return out;
}

async function sharedRoom(): Promise<{
  room: string;
  dev: string;
  owner: string;
  client: Client;
}> {
  const room = randomId(16);
  const dev = randomId(12);
  const owner = newToken();
  const client = await connect(room, dev, "o=" + owner);
  client.send(JSON.stringify({ t: "invite", i: newToken() }));
  await event(client, "invited");
  return { room, dev, owner, client };
}

test("том snapshot-ыг хэсэглэн хадгалж, шинэ холболтод бүтнээр нь буцаана", async () => {
  const { room, dev, owner, client } = await sharedRoom();
  const big = noise(2_600_000);
  await upload(client, big);
  await settled(client);
  client.close();
  const got = await stored(room, dev, owner);
  assert.deepEqual(digest(got), digest([big]));
});

test("нэг хэсэгтэй snapshot хуучин хэлбэрээрээ дамжина", async () => {
  const { room, dev, owner, client } = await sharedRoom();
  const small = noise(5000);
  await upload(client, small);
  await settled(client);
  client.close();
  assert.deepEqual(digest(await stored(room, dev, owner)), digest([small]));
});

test("хэтэрхий том эсвэл тасарсан илгээлт өмнөх snapshot-ыг дарахгүй", async () => {
  const { room, dev, owner, client } = await sharedRoom();
  const first = noise(1_500_000);
  await upload(client, first);
  await upload(client, noise(9 * 1024 * 1024));
  client.send(JSON.stringify({ t: "snap", n: 3 }));
  client.send(noise(1000 * 1024));
  await settled(client);
  client.close();
  assert.deepEqual(digest(await stored(room, dev, owner)), digest([first]));
});

test("өрөөний нийт хэмжээ хэтэрвэл хамгийн хуучин snapshot-ыг хасна", async () => {
  const { room, dev, owner, client } = await sharedRoom();
  await upload(client, noise(7 * 1024 * 1024));
  await settled(client);
  const guests: Uint8Array[] = [];
  for (let index = 0; index < 2; index++) {
    const invite = newToken();
    client.send(JSON.stringify({ t: "invite", i: invite }));
    await event(client, "invited");
    const guest = await connect(room, randomId(12), "i=" + invite);
    const data = noise(6 * 1024 * 1024);
    guests.push(data);
    await upload(guest, data);
    await settled(guest);
    guest.close();
  }
  client.close();
  const got = await stored(room, dev, owner);
  assert.deepEqual(digest(got), digest(guests));
});

test("snapshot-ыг хэсэглэж, толгойг таньж, буцааж нийлүүлнэ", () => {
  const data = noise(SNAPSHOT_PART * 2 + 7);
  const parts = splitSnapshot(data);
  assert.deepEqual(
    parts.map((part) => part.byteLength),
    [SNAPSHOT_PART, SNAPSHOT_PART, 7],
  );
  assert.deepEqual(digest([joinParts(parts)]), digest([data]));
  assert.equal(splitSnapshot(new Uint8Array(0)).length, 1);
  assert.equal(splitSnapshot(noise(SNAPSHOT_PART)).length, 1);
  assert.equal(snapshotParts('{"t":"snap","n":3}'), 3);
  for (const raw of [
    '{"t":"snap","n":1}',
    '{"t":"snap","n":17}',
    '{"t":"snap","n":2.5}',
    '{"t":"snap"',
    '{"t":"hi","n":3}',
  ])
    assert.equal(snapshotParts(raw), null, raw);
});
