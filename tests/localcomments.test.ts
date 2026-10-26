import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { createComments } from "../src/collab/comments.ts";
import {
  createLocalComments,
  type DocRef,
} from "../src/collab/localcomments.ts";
import { swapText } from "../src/editor/editortext.ts";
import {
  diffChange,
  locateQuote,
  shiftEnd,
  shiftStart,
} from "../src/collab/commentmodel.ts";

const dom = installDom('<textarea id="editor"></textarea>');
test.after(() => dom.close());

const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function memoryStore() {
  const data = new Map<string, unknown>();
  return {
    data,
    load: (key: string) => Promise.resolve(data.get(key) ?? null),
    save: (key: string, value: object) => {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    },
    drop: (key: string) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

function setup(text: string) {
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  editor.value = text;
  const store = memoryStore();
  let ref: DocRef | null = { kind: "file", key: "slot1", path: null };
  const local = createLocalComments({
    editor,
    doc: () => ref,
    profile: () => ({ name: "Бат", color: 3 }),
    store,
  });
  const type = (from: number, to: number, insert: string): void => {
    editor.setRangeText(insert, from, to, "end");
    editor.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
  };
  const point = (next: DocRef | null): void => {
    ref = next;
  };
  return { editor, store, local, type, point };
}

function commentOn(
  local: ReturnType<typeof setup>["local"],
  editor: HTMLTextAreaElement,
  word: string,
  text: string,
): string {
  const start = editor.value.indexOf(word);
  const draft = local.draft(start, start + word.length, word)!;
  return local.add(draft, text)!;
}

test("засварын шилжилт хоёр талын дүрмийг баримтална", () => {
  assert.deepEqual(diffChange("abcdef", "abXYef"), {
    from: 2,
    removed: 2,
    inserted: 2,
  });
  assert.equal(diffChange("same", "same"), null);
  const insertAt = { from: 4, removed: 0, inserted: 3 };
  assert.equal(shiftStart(4, insertAt), 7);
  assert.equal(shiftEnd(4, insertAt), 4);
  const cut = { from: 2, removed: 4, inserted: 0 };
  assert.equal(shiftStart(3, cut), 2);
  assert.equal(shiftEnd(5, cut), 2);
  assert.deepEqual(
    locateQuote("нэг хоёр гурав хоёр", { from: 15, to: 19, quote: "хоёр" }),
    { from: 15, to: 19 },
  );
  assert.deepEqual(
    locateQuote("хоёр нэг хоёр", { from: 3, to: 7, quote: "хоёр" }),
    { from: 0, to: 4 },
  );
  assert.equal(locateQuote("абв", { from: 0, to: 2, quote: "өө" }), null);
});

test("хамтралгүй шүүмж засвар дагаж, хадгалагдаж, шинэ нь дээрээ гарна", async () => {
  const { editor, store, local, type } = setup("Өнөөдөр цаг агаар сайхан.");
  await tick();
  const first = commentOn(local, editor, "цаг агаар", "Нэгдүгээр");
  await tick(5);
  const second = commentOn(local, editor, "Өнөөдөр", "Хоёрдугаар");
  assert.deepEqual(
    local.list().map((thread) => thread.id),
    [second, first],
  );
  assert.equal(local.list()[1]!.mine, true);
  assert.equal(local.list()[1]!.name, "Бат");

  type(0, 0, "Маргааш, ");
  const span = local.spans().find((item) => item.id === first)!;
  assert.equal(editor.value.slice(span.from, span.to), "цаг агаар");
  assert.equal(local.at(span.from + 2), first);

  assert.equal(local.reply(first, "Хариу"), true);
  assert.equal(local.edit(first, "Нэгдүгээр шүүмж"), true);
  assert.equal(local.resolve(second, true), true);
  assert.equal(local.spans().length, 1);
  await tick(450);
  const saved = store.data.get("slot1") as { id: string }[];
  assert.equal(saved.length, 2);

  const start = editor.value.indexOf("цаг агаар");
  type(start, start + "цаг агаар".length, "");
  assert.equal(local.list().find((t) => t.id === first)!.from, null);
  assert.equal(local.remove(second), true);
  assert.equal(local.unread(), 0);
  local.destroy();
});

test("бичвэр солигдоход тухайн бичвэрийн шүүмжийг ачаалж, шилжүүлэхгүй", async () => {
  const { editor, store, local, point } = setup("Нэг хоёр");
  store.data.set("slot2", [
    {
      id: "t1",
      author: "zz",
      name: "Дулмаа",
      color: 5,
      at: 1,
      text: "Өөр бичвэрийн шүүмж",
      edited: false,
      path: null,
      from: 0,
      to: 3,
      quote: "Гур",
      resolved: false,
      replies: [],
    },
  ]);
  await tick();
  commentOn(local, editor, "хоёр", "Эхний бичвэрт");
  point({ kind: "file", key: "slot2", path: null });
  swapText(editor, "Гурав дөрөв", { origin: "slot" });
  await tick();
  const [thread] = local.list();
  assert.equal(thread!.text, "Өөр бичвэрийн шүүмж");
  assert.equal(thread!.mine, false);
  assert.equal(thread!.name, "Дулмаа");
  assert.equal(local.edit("t1", "хакердсан"), false);
  assert.equal(local.remove("t1"), false);
  assert.deepEqual(local.spans(), [{ id: "t1", from: 0, to: 3 }]);
  point(null);
  local.sync();
  assert.deepEqual(local.list(), []);
  assert.equal(local.draft(0, 3, "Гур"), null);
  local.destroy();
});

test("хамтрах эхлэхэд шүүмж зохиогчтойгоо шилжиж, дуусахад буцна", async () => {
  const { editor, local } = setup("Сайн байна уу найзаа");
  await tick();
  const id = commentOn(local, editor, "байна", "Миний шүүмж");
  local.reply(id, "Миний хариу");

  const doc = new Y.Doc();
  doc.getText("t").insert(0, editor.value);
  const text = doc.getText("t");
  const comments = createComments({
    doc,
    texts: () => new Map([[null, text]]),
    active: () => text,
    author: "owner",
    profile: () => ({ name: "Бат", color: 3 }),
  });
  const taken = await local.take("slot1");
  assert.deepEqual(local.list(), []);
  comments.adopt([
    ...taken,
    {
      id: "x9",
      author: "guest",
      name: "Дулмаа",
      color: 4,
      at: 2,
      text: "Зочны шүүмж",
      edited: false,
      path: null,
      from: 0,
      to: 4,
      quote: "Сайн",
      resolved: false,
      replies: [],
    },
  ]);
  const threads = comments.list();
  assert.deepEqual(
    threads.map((thread) => [thread.text, thread.mine]),
    [
      ["Миний шүүмж", true],
      ["Зочны шүүмж", false],
    ],
  );
  assert.equal(threads[0]!.replies[0]!.text, "Миний хариу");
  assert.deepEqual([threads[0]!.from, threads[0]!.to], [5, 10]);
  comments.adopt(taken);
  assert.equal(comments.list().length, 2);

  const back = comments.export();
  await local.keep("slot1", back);
  const restored = local.list();
  assert.deepEqual(
    restored.map((thread) => [thread.text, thread.mine, thread.name]),
    [
      ["Миний шүүмж", true, "Бат"],
      ["Зочны шүүмж", false, "Дулмаа"],
    ],
  );
  local.discard("slot1");
  assert.deepEqual(local.list(), []);
  await local.keep("slot1", back);
  assert.deepEqual(local.list(), []);
  local.destroy();
});

test("хамтрагчийн шинэ шүүмж, хариуг уншаагүйд тоолно", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update));
  a.getText("t").insert(0, "Нэг хоёр гурав");
  const open = (doc: Y.Doc, author: string) => {
    const text = doc.getText("t");
    return createComments({
      doc,
      texts: () => new Map([[null, text]]),
      active: () => text,
      author,
      profile: () => ({ name: author, color: 1 }),
    });
  };
  const mine = open(a, "aaa");
  const theirs = open(b, "bbb");
  const id = mine.add(mine.draft(4, 8, "хоёр")!, "Шүүмж")!;
  assert.equal(mine.unread(), 0);
  assert.equal(theirs.unread(), 1);
  theirs.seen();
  assert.equal(theirs.unread(), 0);
  theirs.reply(id, "Хариу");
  assert.equal(theirs.unread(), 0);
  assert.equal(mine.unread(), 1);
});

test("бичвэр цэвэрлэхэд шүүмж устаж, гарсан session-ий шүүмж буцаж ирэхгүй", async () => {
  const { editor, store, local } = setup("Нэг хоёр гурав");
  await tick();
  const id = commentOn(local, editor, "хоёр", "Устах шүүмж");
  await tick(450);
  assert.ok(store.data.has("slot1"));
  const back = [{ ...local.list()[0]!, author: null, replies: [] }];
  local.clear("slot1", true);
  assert.deepEqual(local.list(), []);
  await tick();
  assert.equal(store.data.has("slot1"), false);
  await local.keep("slot1", back);
  assert.deepEqual(local.list(), []);
  await local.keep("slot1", back);
  assert.equal(local.list()[0]!.id, id);
  local.clear("slot1", false);
  await local.keep("slot1", back);
  assert.equal(local.list().length, 1);
  local.destroy();
});
