import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  changesOf,
  decodeBaseline,
  encodeBaseline,
  freshBaseline,
  registerAuthor,
  rejectChange,
} from "../src/collab/changes.ts";
import {
  createChangeTracker,
  forgetBaseline,
} from "../src/collab/changetracker.ts";
import { loadDoc } from "../src/collab/docstore.ts";
import { createChat, MAX_MESSAGES } from "../src/collab/chat.ts";

function pair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc({ gc: false });
  const b = new Y.Doc({ gc: false });
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update, "net"));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update, "net"));
  return [a, b];
}

const until = async (ok: () => boolean, what: string): Promise<void> => {
  const end = Date.now() + 5000;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timeout: " + what);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("өөрчлөлтийг зохиогчтой нь гаргаж, татгалзахад буцаана", () => {
  const [a, b] = pair();
  registerAuthor(a, { name: "Үүсгэгч", color: 1 });
  registerAuthor(b, { name: "Зочин", color: 3 });
  const text = a.getText("t");
  text.insert(0, "Сайн байна уу. Энэ бол жишээ.");
  const base = freshBaseline(a);
  b.getText("t").insert(5, "уу ");
  b.getText("t").delete(20, 4);
  const texts = new Map([[null, text]]);
  const changes = changesOf(a, texts, base);
  assert.deepEqual(
    changes.map((change) => [
      change.from,
      change.inserted,
      change.removed,
      change.author?.name ?? null,
    ]),
    [
      [5, "уу ", "", "Зочин"],
      [20, "", "э бо", null],
    ],
  );
  assert.equal(changes[0]!.before, "Сайн ");
  assert.equal(changes[1]!.after, "л жишээ.");

  rejectChange(text, changes[1]!);
  assert.equal(b.getText("t").toString(), "Сайн уу байна уу. Энэ бол жишээ.");
  assert.deepEqual(
    changesOf(a, texts, base).map((change) => change.inserted),
    ["уу "],
  );
  rejectChange(text, changesOf(a, texts, base)[0]!);
  assert.equal(text.toString(), "Сайн байна уу. Энэ бол жишээ.");
  assert.deepEqual(changesOf(a, texts, base), []);

  b.getText("t").insert(0, "— ");
  const [first] = changesOf(a, texts, base);
  const accepted = { ...base, accepted: new Set([first!.key]) };
  assert.deepEqual(changesOf(a, texts, accepted), []);
  const copy = decodeBaseline(encodeBaseline(accepted))!;
  assert.deepEqual([...copy.accepted], [first!.key]);
  assert.deepEqual(changesOf(a, texts, copy), []);
  assert.equal(decodeBaseline(new Uint8Array([1, 2])), null);
});

test("tracker анхны агуулга ирсний дараа суурь тогтоож, хадгалж, бүгдийг зөвшөөрнө", async () => {
  const [a, b] = pair();
  const tracker = createChangeTracker({
    doc: a,
    room: "talk-room",
    texts: () => new Map([[null, a.getText("t")]]),
  });
  assert.equal(tracker.ready(), false);
  assert.deepEqual(tracker.list(), []);
  b.getText("t").insert(0, "Эхний бичвэр");
  await until(() => tracker.ready(), "baseline");
  assert.deepEqual(tracker.list(), []);
  let heard = 0;
  const off = tracker.onChange(() => heard++);
  b.getText("t").insert(0, "Шинэ: ");
  await until(() => heard > 0, "notify");
  const [change] = tracker.list();
  assert.equal(change?.inserted, "Шинэ: ");
  tracker.accept(change!);
  assert.deepEqual(tracker.list(), []);
  b.getText("t").delete(0, 6);
  b.getText("t").insert(0, "Х");
  assert.equal(tracker.list().length, 1);
  tracker.reject(tracker.list()[0]!);
  assert.equal(b.getText("t").toString(), "Эхний бичвэр");
  b.getText("t").insert(0, "А");
  tracker.acceptAll();
  assert.deepEqual(tracker.list(), []);
  off();
  tracker.destroy();
  await until(() => true, "flush");
  const stored = await loadDoc("base:talk-room");
  assert.ok(stored && decodeBaseline(stored));

  const again = createChangeTracker({
    doc: a,
    room: "talk-room",
    texts: () => new Map([[null, a.getText("t")]]),
  });
  await until(() => again.ready(), "stored baseline");
  b.getText("t").insert(0, "Б");
  assert.deepEqual(
    again.list().map((item) => item.inserted),
    ["Б"],
  );
  again.destroy();
  await forgetBaseline("talk-room");
  assert.equal(await loadDoc("base:talk-room"), null);
});

test("chat мессежийг дамжуулж, уншаагүйг тоолж, дээд хэмжээг барина", () => {
  const [a, b] = pair();
  const mine = createChat(a, "dev-a", () => ({ name: "Би", color: 2 }));
  const theirs = createChat(b, "dev-b", () => ({ name: "Чи", color: 5 }));
  let heard = 0;
  const off = mine.onChange(() => heard++);
  assert.equal(mine.send("   "), false);
  assert.equal(theirs.send(" Сайн уу "), true);
  assert.equal(heard, 1);
  assert.deepEqual(
    mine.list().map((message) => [message.name, message.text, message.mine]),
    [["Чи", "Сайн уу", false]],
  );
  assert.equal(mine.unread(), 1);
  mine.seen();
  assert.equal(mine.unread(), 0);
  mine.send("Сайн");
  assert.equal(theirs.unread(), 1);
  assert.equal(theirs.list()[1]!.mine, false);
  for (let index = 0; index < MAX_MESSAGES; index++) theirs.send("м" + index);
  assert.equal(mine.list().length, MAX_MESSAGES);
  assert.equal(mine.list().at(-1)!.text, "м" + (MAX_MESSAGES - 1));
  b.getArray("chat").push([{ bad: true }]);
  assert.equal(mine.list().length, MAX_MESSAGES);
  off();
  mine.destroy();
  theirs.destroy();
});
