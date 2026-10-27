import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import NodeSocket from "ws";
import { startCollab, type CollabServer } from "./helpers/collabserver.ts";
import { ORIGIN } from "./helpers/collabpeer.ts";
import {
  connect as open,
  event,
  knock as tryOpen,
  type Client,
} from "./helpers/collabclient.ts";
import { newToken, randomId } from "../src/collab/collabkey.ts";

const DENIED = 4003;
const FULL = 4009;
const MAX_PEERS = 8;
const MAX_INVITES = 32;

let server: CollabServer;
const connect = (room: string, dev: string, access: string, id?: string) =>
  open(server.url, room, dev, access, id);
const knock = (room: string, dev: string, access: string, id?: string) =>
  tryOpen(server.url, room, dev, access, id);
before(async () => {
  server = await startCollab();
  await server.allow(ORIGIN);
});
after(() => server.close());

async function alive(client: Client): Promise<void> {
  client.send(JSON.stringify({ t: "to", to: client.id, d: "ok" }));
  await event(client, "from");
}

async function ownedRoom() {
  const room = randomId(16);
  const dev = randomId(12);
  const owner = newToken();
  const client = await connect(room, dev, "o=" + owner);
  return { room, dev, owner, client };
}

async function invite(client: Client, name?: string) {
  const token = newToken();
  client.send(JSON.stringify({ t: "invite", i: token, n: name }));
  const reply = (await event(client, "invited")) as { c?: string };
  return { token, code: reply.c };
}

function lookup(code: string): Promise<Record<string, unknown>> {
  const ws = new NodeSocket(server.url.replace(/^http/, "ws") + "/j/" + code, {
    headers: { Origin: ORIGIN },
  });
  return new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("message", (data: Buffer) => resolve(JSON.parse(data.toString())));
  });
}

test("өөр төхөөрөмж бусдын peer id-гаар холбогдож тэднийг салгаж чадахгүй", async () => {
  const { room, client } = await ownedRoom();
  const { token } = await invite(client);
  const guestDev = randomId(12);
  const guest = await connect(room, guestDev, "i=" + token);
  const m = guest.member!;
  assert.equal(await knock(room, guestDev, "m=" + m, client.id), DENIED);
  await alive(client);
  const again = await connect(room, guestDev, "m=" + m, guest.id);
  await alive(again);
  for (const peer of [client, guest, again]) peer.close();
});

test("өрөө дүүрсэн үед урилгыг ашигласан гэж тэмдэглэхгүй", async () => {
  const { room, dev, owner, client } = await ownedRoom();
  const { token } = await invite(client);
  const crowd = [client];
  while (crowd.length < MAX_PEERS)
    crowd.push(await connect(room, dev, "o=" + owner));
  assert.equal(await knock(room, randomId(12), "i=" + token), FULL);
  const last = crowd.pop()!;
  last.send(JSON.stringify({ t: "leave" }));
  await alive(client);
  assert.equal(await knock(room, randomId(12), "i=" + token), 0);
  for (const peer of [...crowd, last]) peer.close();
});

test("богино холбоос өрөөний хадгалдаг сүүлийн урилгуудаас хэтрэхгүй", async () => {
  const { client } = await ownedRoom();
  const codes: string[] = [];
  for (let i = 0; i <= MAX_INVITES; i++)
    codes.push((await invite(client, "a.md")).code!);
  assert.deepEqual(await lookup(codes[0]!), { t: "link" });
  const newest = await lookup(codes.at(-1)!);
  assert.equal(newest.name, "a.md");
  assert.equal(typeof newest.invite, "string");
  client.close();
});
