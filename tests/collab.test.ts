import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createEmitter } from "../src/core/emitter.ts";
import {
  applyChanges,
  deltaChanges,
  mapOffset,
} from "../src/editor/textdelta.ts";
import {
  fromBase64Url,
  importKey,
  isProjectName,
  linkHash,
  newLink,
  newToken,
  parseLink,
  projectName,
  seal,
  sharedName,
  toBase64Url,
  unseal,
} from "../src/collab/collabkey.ts";
import {
  SYNC_UPDATE,
  CHAT_UPDATE,
  chunk,
  createAssembler,
  decodeFrame,
  encodeFrame,
} from "../src/collab/wire.ts";
import { parseSignal, retryDelay } from "../src/collab/signal.ts";
import { createIceKeeper, iceRefreshMs } from "../src/collab/ice.ts";
import {
  createSync,
  MAX_CHAT_UPDATE,
  relayTargets,
  type Sync,
} from "../src/collab/sync.ts";
import {
  connectionControls,
  createGate,
  roomUrl,
} from "../src/collab/session.ts";
import { isUploader, uploadAt } from "../src/collab/persistence.ts";
import { buttonLabel, joinName } from "../src/collab/collab.ts";
import {
  fileSlot,
  invitedUid,
  parseSlot,
  projectSlot,
  slotKey,
} from "../src/collab/roomslot.ts";
import { rebaseLocal } from "../src/collab/textbind.ts";
import { directServers, shouldRecall } from "../src/collab/mesh.ts";
import {
  parseRooms,
  roomById,
  roomOfSlot,
  isOwner,
  withAccess,
  withRoom,
  withoutRoom,
} from "../src/collab/collabrooms.ts";
import { rebaseHistory, undo } from "../src/editor/undohistory.ts";
import { createAdmin } from "../src/collab/admin.ts";

test("Yjs delta-г засварын жагсаалт болгоно", () => {
  const changes = deltaChanges([
    { retain: 2 },
    { delete: 3 },
    { insert: "xy" },
    { retain: 4 },
    { insert: "z" },
  ]);
  assert.deepEqual(changes, [
    { from: 2, to: 5, insert: "xy" },
    { from: 9, to: 9, insert: "z" },
  ]);
  assert.equal(applyChanges("abcdefghijk", changes), "abxyfghizjk");
});

test("курсорын байрлалыг бусдын засвараар шилжүүлнэ", () => {
  const changes = [
    { from: 2, to: 5, insert: "xy" },
    { from: 9, to: 9, insert: "z" },
  ];
  assert.equal(mapOffset(changes, 0), 0);
  assert.equal(mapOffset(changes, 2), 2);
  assert.equal(mapOffset(changes, 3), 4);
  assert.equal(mapOffset(changes, 6), 5);
  assert.equal(mapOffset(changes, 9), 8);
  assert.equal(mapOffset(changes, 10), 10);
});

test("зөвхөн txt, md, tex файлыг хуваалцана", () => {
  for (const name of ["a.txt", "b.MD", "c.markdown", "d.tex", "e.ltx"])
    assert.equal(sharedName(name), true, name);
  for (const name of [
    "a.pdf",
    "b.docx",
    "c.odt",
    "d",
    "e/f.md",
    "x".repeat(200) + ".md",
  ])
    assert.equal(sharedName(name), false, name);
  assert.equal(joinName("notes.md", false, true), "notes.md");
  assert.equal(joinName(null, true, false), "Хамтын бичвэр.tex");
  assert.equal(joinName(null, false, true), "Хамтын бичвэр.md");
  assert.equal(joinName(null, false, false), "Хамтын бичвэр.txt");
});

test("өрөөний слотыг түлхүүр болгож буцааж задална", () => {
  for (const slot of [fileSlot("file-a"), projectSlot("u1"), fileSlot("")])
    assert.deepEqual(parseSlot(slotKey(slot)), slot);
  assert.equal(slotKey(projectSlot("u1")), "project:u1");
  assert.equal(slotKey(fileSlot("file-a")), "file-a");
  assert.equal(invitedUid("room"), "croom");
});

test("төслийн нэрийг холбоост тэмдэглэнэ", () => {
  assert.equal(projectName("Дипломын ажил"), "Дипломын ажил/");
  assert.equal(projectName("a/b:c"), "a b c/");
  assert.equal(projectName("  "), "LaTeX/");
  assert.equal(projectName("х".repeat(200)).length, 120);
  assert.equal(isProjectName("Дипломын ажил/"), true);
  assert.equal(isProjectName("/"), false);
  assert.equal(isProjectName("a/b/"), false);
  assert.equal(isProjectName("paper.tex"), false);
  const link = { ...newLink(), invite: newToken(), name: "Дипломын ажил/" };
  assert.deepEqual(parseLink(linkHash(link)), link);
});

test("хамтын холбоосыг задлах, үүсгэх", () => {
  const link = { ...newLink(), invite: newToken() };
  assert.equal(link.room.length, 22);
  assert.equal(link.key.length, 43);
  assert.equal(link.invite.length, 22);
  assert.deepEqual(parseLink(linkHash(link)), link);
  assert.equal(parseLink("#collab=" + link.room + "." + link.key), null);
  assert.equal(parseLink("#collab=short.key"), null);
  assert.equal(parseLink(""), null);
  const named = { ...link, name: "Тайлан 2026.md" };
  assert.deepEqual(parseLink(linkHash(named)), named);
  const tex = { ...link, name: "paper.tex" };
  assert.deepEqual(parseLink(linkHash(tex)), tex);
  assert.deepEqual(parseLink(linkHash({ ...link, name: "a.pdf" })), link);
  const forged = linkHash(link) + "." + toBase64Url(new Uint8Array([255]));
  assert.deepEqual(parseLink(forged), link);
  const slashed = toBase64Url(new TextEncoder().encode("../x.md"));
  assert.deepEqual(parseLink(linkHash(link) + "." + slashed), link);
  const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(fromBase64Url(toBase64Url(bytes)), bytes);
});

test("шифрлэсэн өгөгдлийг зөвхөн зөв түлхүүрээр тайлна", async () => {
  const key = await importKey(newLink().key);
  const other = await importKey(newLink().key);
  const data = new TextEncoder().encode("Сайн байна уу");
  const sealed = await seal(key, data);
  assert.notDeepEqual(sealed.subarray(12), data);
  assert.deepEqual(await unseal(key, sealed), data);
  assert.equal(await unseal(other, sealed), null);
  assert.equal(await unseal(key, new Uint8Array(5)), null);
});

test("том мессежийг хэсэглэн илгээж буцааж нийлүүлнэ", () => {
  const data = new Uint8Array(40_000).map((_, i) => i % 251);
  const pieces = chunk(data, 1000);
  assert.ok(pieces.length > 40);
  const assembler = createAssembler(1_000_000);
  let out: Uint8Array | null = null;
  for (const piece of pieces) out = assembler.push(piece) ?? out;
  assert.deepEqual(out, data);
  const small = chunk(new Uint8Array([1, 2, 3]));
  assert.equal(small.length, 1);
  assert.deepEqual(assembler.push(small[0]!), new Uint8Array([1, 2, 3]));
});

test("хэт том мессежийг хаяад дараагийнхыг зөв хүлээн авна", () => {
  const assembler = createAssembler(5000);
  for (const piece of chunk(new Uint8Array(20_000), 1000))
    assert.equal(assembler.push(piece), null);
  const next = new Uint8Array(3000).fill(7);
  let out: Uint8Array | null = null;
  for (const piece of chunk(next, 1000)) out = assembler.push(piece) ?? out;
  assert.deepEqual(out, next);
});

test("frame-ийн төрлийг шалгана", () => {
  const frame = decodeFrame(encodeFrame(SYNC_UPDATE, new Uint8Array([9])));
  assert.equal(frame?.kind, SYNC_UPDATE);
  assert.deepEqual(frame?.body, new Uint8Array([9]));
  assert.equal(decodeFrame(new Uint8Array([CHAT_UPDATE + 1, 0])), null);
  assert.equal(
    decodeFrame(new Uint8Array([CHAT_UPDATE, 0]))?.kind,
    CHAT_UPDATE,
  );
  assert.equal(decodeFrame(new Uint8Array()), null);
});

test("сигналын мессежийг шалгаж задлана", () => {
  assert.deepEqual(parseSignal('{"t":"hi","id":"a","peers":["b",3]}'), {
    t: "hi",
    id: "a",
    peers: ["b"],
    shared: false,
    ice: [],
    life: 0,
  });
  assert.equal(
    (
      parseSignal('{"t":"hi","id":"a","peers":[],"s":true}') as {
        shared: boolean;
      }
    ).shared,
    true,
  );
  assert.deepEqual(
    (
      parseSignal(
        JSON.stringify({
          t: "hi",
          id: "a",
          peers: [],
          ice: [
            { urls: ["stun:stun.cloudflare.com:3478"] },
            {
              urls: [
                "turn:turn.cloudflare.com:3478?transport=udp",
                "turn:turn.cloudflare.com:53?transport=udp",
                "https://evil.example",
              ],
              username: "u",
              credential: "c",
            },
            { urls: "turns:turn.cloudflare.com:443?transport=tcp" },
            { urls: [] },
            "x",
          ],
        }),
      ) as { ice: RTCIceServer[] }
    ).ice,
    [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
        username: "u",
        credential: "c",
      },
      { urls: ["turns:turn.cloudflare.com:443?transport=tcp"] },
    ],
  );
  assert.deepEqual(
    parseSignal(
      '{"t":"ice","ice":[{"urls":"turn:t:3478","username":"u","credential":"c"}],"life":7200}',
    ),
    {
      t: "ice",
      ice: [{ urls: ["turn:t:3478"], username: "u", credential: "c" }],
      life: 7200,
    },
  );
  assert.equal(
    (parseSignal('{"t":"ice","ice":[],"life":-5}') as { life: number }).life,
    0,
  );
  assert.deepEqual(parseSignal('{"t":"bye","id":"a"}'), { t: "bye", id: "a" });
  assert.deepEqual(parseSignal('{"t":"from","from":"a","d":"x"}'), {
    t: "from",
    from: "a",
    d: "x",
  });
  assert.equal(parseSignal('{"t":"from","from":"a"}'), null);
  assert.deepEqual(parseSignal('{"t":"kick","id":"a"}'), {
    t: "kick",
    id: "a",
  });
  assert.deepEqual(parseSignal('{"t":"member","m":"x"}'), {
    t: "member",
    m: "x",
  });
  assert.deepEqual(parseSignal('{"t":"invited","i":"x"}'), {
    t: "invited",
    i: "x",
  });
  assert.deepEqual(
    parseSignal(
      '{"t":"members","list":[{"dev":"d","l":"x","on":true,"o":false},{"l":1},5]}',
    ),
    {
      t: "members",
      list: [{ dev: "d", label: "x", online: true, owner: false }],
    },
  );
  assert.equal(parseSignal("not json"), null);
});

test("дахин холбогдох хугацаа аажмаар уртасна", () => {
  assert.equal(retryDelay(0, 1), 1000);
  assert.equal(retryDelay(3, 1), 8000);
  assert.equal(retryDelay(20, 1), 60_000);
  assert.equal(retryDelay(20, 0), 30_000);
});

test("зөвхөн удирдагч эсвэл түүнд холбогдоогүй хүн snapshot илгээнэ", () => {
  assert.equal(isUploader("b", new Set(["c", "d"]), []), true);
  assert.equal(isUploader("c", new Set(["b", "d"]), ["b"]), false);
  assert.equal(isUploader("c", new Set(["b", "d"]), ["d"]), true);
  assert.equal(shouldRecall("c", "b"), true);
  assert.equal(shouldRecall("b", "c"), false);
});

test("эхний холболт TURN-гүй, зөвхөн STUN ашиглана", () => {
  assert.deepEqual(
    directServers([
      {
        urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:443"],
      },
      {
        urls: [
          "turn:turn.cloudflare.com:3478",
          "turns:turn.cloudflare.com:443",
        ],
        username: "u",
        credential: "c",
      },
      { urls: "stun:other:3478" },
    ]),
    [
      {
        urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:443"],
      },
      { urls: ["stun:other:3478"] },
    ],
  );
});

test("өрөөний хаягийг ws протоколоор үүсгэнэ", () => {
  assert.equal(
    roomUrl("https://collab.example.dev/", "R", "D", "P", {
      kind: "o",
      token: "T",
    }),
    "wss://collab.example.dev/room/R?d=D&p=P&o=T",
  );
  assert.equal(
    roomUrl("http://localhost:8787", "R", "D", "P", { kind: "i", token: "T" }),
    "ws://localhost:8787/room/R?d=D&p=P&i=T",
  );
});

test("засварыг зөвхөн шууд холбогдоогүй хүмүүст дамжуулна", () => {
  assert.deepEqual(relayTargets(["a", "b", "c"], "a", new Set(["b"])), ["c"]);
  assert.deepEqual(relayTargets(["a", "b"], "a", undefined), ["b"]);
});

function wire(docs: Y.Doc[], chats: Y.Doc[] = []): Sync[] {
  const ids = docs.map((_, i) => String(i));
  const syncs: Sync[] = [];
  docs.forEach((doc, i) => {
    syncs[i] = createSync({
      doc,
      chat: chats[i],
      open: () => ids.filter((id) => id !== ids[i]),
      send: (peer, data) =>
        queueMicrotask(() => syncs[Number(peer)]!.receive(ids[i]!, data)),
      onCursor: () => {},
    });
  });
  return syncs;
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 80));

test("хоёр баримт нэгэн зэрэг засахад ижил үр дүнд хүрнэ", async () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.getText("t").insert(0, "Сайн уу");
  const syncs = wire([a, b]);
  syncs[1]!.joined("0");
  syncs[0]!.joined("1");
  await settle();
  assert.equal(b.getText("t").toString(), "Сайн уу");
  a.getText("t").insert(4, " байна");
  b.getText("t").insert(7, "!");
  await settle();
  assert.equal(a.getText("t").toString(), b.getText("t").toString());
  assert.equal(a.getText("t").toString(), "Сайн байна уу!");
  for (const sync of syncs) sync.close();
});

test("chat баримтыг тусад нь дамжуулж, хэт том шинэчлэлтийг хаяна", async () => {
  const docs = [new Y.Doc(), new Y.Doc()];
  const chats = [new Y.Doc(), new Y.Doc()];
  chats[0]!.getArray("chat").push(["эхний"]);
  const syncs = wire(docs, chats);
  syncs[1]!.joined("0");
  syncs[0]!.joined("1");
  await settle();
  assert.deepEqual(chats[1]!.getArray("chat").toArray(), ["эхний"]);
  chats[1]!.getArray("chat").push(["хариу"]);
  await settle();
  assert.deepEqual(chats[0]!.getArray("chat").toArray(), ["эхний", "хариу"]);
  assert.equal(docs[1]!.getArray("chat").length, 0);
  const big = new Y.Doc();
  big.getText("x").insert(0, "а".repeat(MAX_CHAT_UPDATE));
  syncs[0]!.receive("1", encodeFrame(CHAT_UPDATE, Y.encodeStateAsUpdate(big)));
  assert.equal(chats[0]!.getText("x").length, 0);
  for (const sync of syncs) sync.close();
});

test("засвар хүлээж байх үед ирсэн өөрчлөлтийг зөв байрлуулна", () => {
  const remote = [{ from: 0, to: 0, insert: ">> " }];
  assert.deepEqual(rebaseLocal("abc", "abXc", remote), {
    text: ">> abXc",
    local: { from: 5, to: 5, insert: "X" },
  });
  assert.deepEqual(rebaseLocal("abc", "abc", remote), {
    text: ">> abc",
    local: null,
  });
});

test("буцаах түүхийг бусдын засвараар шилжүүлнэ", () => {
  const history = {
    undo: [
      {
        from: 4,
        removed: "",
        inserted: "XY",
        before: [4, 4] as [number, number],
        after: [6, 6] as [number, number],
        at: 0,
      },
    ],
    redo: [],
  };
  const rebased = rebaseHistory(history, [{ from: 0, to: 0, insert: "123" }]);
  assert.equal(rebased.undo[0]!.from, 7);
  assert.deepEqual(rebased.undo[0]!.after, [9, 9]);
  assert.equal(undo("123abcdXYef", rebased)?.text, "123abcdef");
});

test("хамтын өрөөнүүдийн жагсаалтыг шалгана", () => {
  const owner = { kind: "o", token: "A".repeat(22) } as const;
  const invite = { kind: "i", token: "B".repeat(22) } as const;
  const rooms = parseRooms([
    { slot: "plain", room: "r1", key: "k1", access: owner },
    { slot: "plain", room: "r2", key: "k2", access: owner },
    { slot: "file-a", room: "r1", key: "k3", access: owner },
    { slot: "file-b", room: "bad room", key: "k", access: owner },
    { slot: "file-c", room: "r4", key: "k4" },
    {
      slot: "file-d",
      room: "r5",
      key: "k5",
      access: { kind: "x", token: "A" },
    },
    null,
  ]);
  assert.deepEqual(rooms, [
    { slot: "plain", room: "r1", key: "k1", access: owner },
  ]);
  assert.equal(isOwner(rooms[0]!), true);
  const more = withRoom(rooms, {
    slot: "file-a",
    room: "r2",
    key: "k2",
    access: invite,
  });
  assert.equal(roomOfSlot(more, fileSlot("file-a"))?.room, "r2");
  assert.equal(isOwner(roomOfSlot(more, fileSlot("file-a"))!), false);
  assert.equal(roomOfSlot(more, projectSlot("file-a")), null);
  assert.equal(roomById(more, "r1")?.slot, "plain");
  assert.equal(withoutRoom(more, "r1").length, 1);
  const member = { kind: "m", token: "C".repeat(22) } as const;
  assert.deepEqual(
    roomById(withAccess(more, "r2", member), "r2")?.access,
    member,
  );
  assert.deepEqual(
    roomById(withAccess(more, "r2", member), "r1")?.access,
    owner,
  );
  assert.deepEqual(parseRooms("x"), []);
});

test("тасралтгүй бичсэн ч 5 минут тутамд snapshot хийнэ", () => {
  const min = 60_000;
  assert.equal(uploadAt(0, 0, 0), 30_000);
  assert.equal(uploadAt(4 * min, 0, 0), 4.5 * min);
  assert.equal(uploadAt(4.9 * min, 0, 0), 5 * min);
  assert.equal(uploadAt(10 * min, 10 * min, 9 * min), 14 * min);
  assert.equal(uploadAt(20 * min, 10 * min, 0), 15 * min);
});

test("товчны шошго төлөвийг харуулна", () => {
  assert.equal(buttonLabel(false, null), "Хамтрах");
  assert.equal(buttonLabel(true, null), "Хамтрах");
  assert.equal(buttonLabel(true, { signal: "open", peers: 0 }), "Хамтрах");
  assert.equal(buttonLabel(true, { signal: "closed", peers: 2 }), "Хамтрагч 3");
  assert.equal(
    buttonLabel(true, { signal: "full", peers: 0 }),
    "Хамтрагч · дүүрсэн",
  );
});

test("урилгыг сервер баталсны дараа л буцаана", async () => {
  const key = await importKey(newLink().key);
  const sent: Record<string, unknown>[] = [];
  let online = true;
  const admin = createAdmin(key, (message) => {
    sent.push(message);
    return online;
  });
  const pending = admin.invite();
  const token = sent[0]!.i as string;
  assert.equal(sent[0]!.t, "invite");
  assert.equal(admin.receive({ t: "invited", i: token }), true);
  assert.equal(await pending, token);
  online = false;
  assert.equal(await admin.invite(), null);
  assert.equal(await admin.members(), null);
  assert.equal(await admin.end(true), false);
});

test("хуваалцахыг зогсоохыг сервер баталсны дараа л амжилттай гэж үзнэ", async () => {
  const key = await importKey(newLink().key);
  const sent: Record<string, unknown>[] = [];
  const admin = createAdmin(key, (message) => {
    sent.push(message);
    return true;
  });
  const ending = admin.end(true);
  assert.deepEqual(sent[0], { t: "close", wipe: true });
  assert.deepEqual(parseSignal('{"t":"ended"}'), { t: "ended" });
  assert.equal(admin.receive({ t: "ended" }), true);
  assert.equal(await ending, true);
});

test("хамтрагчдын нэрийг түлхүүрээр тайлж харуулна", async () => {
  const key = await importKey(newLink().key);
  const sent: Record<string, unknown>[] = [];
  const admin = createAdmin(key, (message) => {
    sent.push(message);
    return true;
  });
  admin.label("Сараа");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const label = sent[0]!.l as string;
  assert.equal(sent[0]!.t, "label");
  assert.ok(!label.includes("Сараа"));
  const listed = admin.members();
  admin.receive({
    t: "members",
    list: [
      { dev: "a", label, online: true, owner: false },
      { dev: "b", label: "эвдэрсэн", online: false, owner: true },
    ],
  });
  assert.deepEqual(await listed, [
    { dev: "a", name: "Сараа", online: true, owner: false },
    { dev: "b", name: "", online: false, owner: true },
  ]);
  const removed = admin.remove("a", true);
  assert.deepEqual(sent.at(-1), { t: "remove", dev: "a", wipe: true });
  admin.receive({ t: "members", list: [] });
  assert.deepEqual(await removed, []);
});

test("TURN эрхийг хугацаа дуусахаас өмнө шинэчилнэ", async () => {
  assert.equal(iceRefreshMs(7200), 5400_000);
  assert.equal(iceRefreshMs(600), 60_000);
  let requests = 0;
  let applied = 0;
  const keeper = createIceKeeper(() => ({
    signal: { command: () => (requests++, true) },
    mesh: { refresh: () => applied++ },
  }));
  const stun = keeper.servers();
  keeper.take({ ice: [], life: 7200 });
  keeper.take({ ice: [{ urls: ["turn:t"] }], life: 0 });
  assert.equal(keeper.servers(), stun);
  assert.equal(applied, 0);
  const turn = [{ urls: ["turn:t"], username: "u", credential: "c" }];
  keeper.take({ ice: turn, life: 7200 });
  assert.equal(keeper.servers(), turn);
  assert.equal(applied, 1);
  keeper.stop();
  assert.equal(requests, 0);
});

test("сэрэх үед холболт тогтохыг хүлээгээд дараа нь илгээнэ", async () => {
  let open = false;
  const gate = createGate(() => open, 200);
  let passed = false;
  const waiting = gate.wait().then(() => (passed = true));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(passed, false);
  open = true;
  gate.release();
  await waiting;
  assert.equal(passed, true);
  await gate.wait();
  open = false;
  const started = Date.now();
  await gate.wait();
  assert.ok(Date.now() - started >= 190);
});

test("унтах явцад сэрвэл холболтыг хаахгүй", async () => {
  const calls: string[] = [];
  const signal = {
    sleep: () => calls.push("sleep"),
    resume: () => calls.push("resume"),
  } as unknown as Parameters<typeof connectionControls>[0];
  const uploader = {
    run: () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
  } as unknown as Parameters<typeof connectionControls>[1];
  const controls = connectionControls(signal, uploader, createEmitter());
  controls.sleep();
  controls.resume();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["resume"]);
  controls.sleep();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(calls, ["resume", "sleep"]);
});
