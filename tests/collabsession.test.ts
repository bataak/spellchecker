import "fake-indexeddb/auto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import { installRtc } from "./helpers/fakertc.ts";
import { startCollab, type CollabServer } from "./helpers/collabserver.ts";
import {
  ORIGIN,
  installSocket,
  startPeer,
  typeAt,
  until,
  type Peer,
} from "./helpers/collabpeer.ts";
import { createHash } from "node:crypto";
import { newLink, newToken, randomId } from "../src/collab/collabkey.ts";
import { roomUrl } from "../src/collab/session.ts";
import {
  SNAPSHOT_PART,
  openSignal,
  type SignalEvent,
} from "../src/collab/signal.ts";
import type { Access } from "../src/collab/collabrooms.ts";

const dom = installDom("<textarea id=a></textarea><textarea id=b></textarea>");
const restoreRtc = installRtc();
const restoreSocket = installSocket();

let server: CollabServer;
before(async () => {
  server = await startCollab();
  await server.allow(ORIGIN);
});
after(async () => {
  await server.close();
  restoreSocket();
  restoreRtc();
  await dom.close();
});

function join(
  id: string,
  link: ReturnType<typeof newLink>,
  access: Access,
  seed: string | null,
): Promise<Peer> {
  return startPeer({
    endpoint: server.url,
    editor: document.querySelector<HTMLTextAreaElement>(id)!,
    link,
    access,
    name: id === "#a" ? "Үүсгэгч" : "Зочин",
    seed,
  });
}

test("хоёр төхөөрөмж урилгаар нэгдэж, засварыг хоёр тийш дамжуулж, гишүүдийг удирдана", async () => {
  const link = newLink();
  const owner = await join(
    "#a",
    link,
    { kind: "o", token: newToken() },
    "Сайн",
  );
  await until(() => owner.status()?.signal === "open", "owner open");
  const invite = await owner.session.invite();
  assert.ok(invite);

  const guest = await join("#b", link, { kind: "i", token: invite }, null);
  await until(() => guest.editor.value === "Сайн", "guest text");
  await until(() => guest.access().kind === "m", "guest member");
  await until(() => owner.status()?.peers === 1, "owner peers");

  typeAt(guest.editor, 4, " байна уу");
  await until(() => owner.editor.value === "Сайн байна уу", "owner sees guest");
  typeAt(owner.editor, 0, "— ");
  await until(
    () => guest.editor.value === "— Сайн байна уу",
    "guest sees owner",
  );

  const members = await owner.session.members();
  assert.deepEqual(
    members?.map((member) => [member.name, member.owner, member.online]).sort(),
    [
      ["", true, true],
      ["Зочин", false, true],
    ],
  );
  const visitor = members!.find((member) => !member.owner)!;

  const left = await owner.session.remove(visitor.dev, false);
  assert.deepEqual(
    left?.map((member) => member.owner),
    [true],
  );
  await until(() => guest.status()?.signal === "removed", "guest removed");

  await guest.session.stop(false);
  assert.equal(await owner.session.end(false), true);
  await owner.session.stop(true);
});

test("signal том snapshot-ыг хэсэглэн илгээж, дараагийн холболтод бүтнээр нь хүлээн авна", async () => {
  const link = newLink();
  const device = randomId(12);
  const access: Access = { kind: "o", token: newToken() };
  const url = (): string =>
    roomUrl(server.url, link.room, device, randomId(12), access);
  const events: SignalEvent[] = [];
  const seen = (type: SignalEvent["t"]) => () =>
    events.some((event) => event.t === type);
  const first = openSignal({
    url,
    onEvent: (event) => events.push(event),
    onSnapshot: () => {},
    onState: () => {},
  });
  await until(seen("hi"), "hi");
  assert.equal(first.command({ t: "invite", i: newToken() }), true);
  await until(seen("invited"), "invited");
  const data = new Uint8Array(SNAPSHOT_PART * 2 + 500);
  for (let at = 0; at < data.byteLength; at += 65536)
    crypto.getRandomValues(data.subarray(at, at + 65536));
  assert.equal(first.upload(data), true);
  first.command({ t: "members" });
  await until(seen("members"), "members");
  first.close();

  const got: Uint8Array[] = [];
  const second = openSignal({
    url,
    onEvent: () => {},
    onSnapshot: (snapshot) => got.push(snapshot),
    onState: () => {},
  });
  await until(() => got.length > 0, "snapshot");
  second.close();
  const digest = (bytes: Uint8Array): string =>
    createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(got.map(digest), [digest(data)]);
});
