import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { startCollab, type CollabServer } from "./helpers/collabserver.ts";
import { ORIGIN } from "./helpers/collabpeer.ts";
import { connect, event, type Client } from "./helpers/collabclient.ts";
import { newToken, randomId } from "../src/collab/collabkey.ts";

const ICE = [
  { urls: ["turn:turn.example:3478"], username: "u", credential: "c" },
];

let failing = true;
let calls = 0;
let release: () => void = () => {};
let server: CollabServer;
before(async () => {
  server = await startCollab({
    daily: 1,
    turn: async () => {
      calls++;
      if (failing) return new Response("down", { status: 500 });
      await new Promise<void>((resolve) => (release = resolve));
      return Response.json({ iceServers: ICE });
    },
  });
  await server.allow(ORIGIN);
});
after(() => server.close());

async function pair(): Promise<{ owner: Client; guest: Client }> {
  const room = randomId(16);
  const owner = await connect(
    server.url,
    room,
    randomId(12),
    "o=" + newToken(),
  );
  const invite = newToken();
  owner.send(JSON.stringify({ t: "invite", i: invite }));
  await event(owner, "invited");
  const guest = await connect(server.url, room, randomId(12), "i=" + invite);
  return { owner, guest };
}

test(
  "TURN авч чадаагүй оролдлого өдрийн квотыг зарцуулахгүй, нэгдэгч TURN-ийг хүлээлгүй hi авна",
  { timeout: 20_000 },
  async () => {
    const first = await pair();
    assert.deepEqual(first.guest.hi.ice, []);
    await event(first.owner, "join");
    const end = Date.now() + 5000;
    while (calls < 1 && Date.now() < end)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls, 1);
    first.owner.close();
    first.guest.close();

    failing = false;
    const second = await pair();
    assert.deepEqual(second.guest.hi.ice, []);
    while (calls < 2 && Date.now() < end + 5000)
      await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const offers = (await Promise.all([
      event(second.owner, "ice"),
      event(second.guest, "ice"),
    ])) as { ice: unknown; life: number }[];
    for (const offer of offers) {
      assert.deepEqual(offer.ice, ICE);
      assert.ok(offer.life > 0);
    }
    second.owner.close();
    second.guest.close();
  },
);
