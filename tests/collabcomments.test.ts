import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import {
  authorKey,
  createComments,
  MAX_QUOTE,
  validComment,
  type Comments,
} from "../src/collab/comments.ts";
import {
  commentsCount,
  commentsView,
  resolvedLabel,
} from "../src/collab/commentview.ts";
import type { CommentThread } from "../src/collab/comments.ts";

const dom = installDom("");
test.after(() => dom.close());

function pair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc({ gc: false });
  const b = new Y.Doc({ gc: false });
  a.on("update", (update: Uint8Array) => Y.applyUpdate(b, update, "net"));
  b.on("update", (update: Uint8Array) => Y.applyUpdate(a, update, "net"));
  return [a, b];
}

function open(doc: Y.Doc, author: string, name = author): Comments {
  const text = doc.getText("t");
  return createComments({
    doc,
    texts: () => new Map([[null, text]]),
    active: () => text,
    author,
    profile: () => ({ name, color: 2 }),
  });
}

function draftOf(comments: Comments, doc: Y.Doc, word: string) {
  const value = doc.getText("t").toString();
  const start = value.indexOf(word);
  return comments.draft(start, start + word.length, word)!;
}

test("шүүмж хамтрагчид дамжиж, засвар хийхэд байрлалаа хадгална", () => {
  const [a, b] = pair();
  a.getText("t").insert(0, "Сайн байна уу найзаа");
  const mine = open(a, "aaa", "Бат");
  const theirs = open(b, "bbb", "Дулмаа");
  const id = mine.add(draftOf(mine, a, "байна"), "  Энэ үгийг солих уу?  ")!;
  assert.ok(id);
  const [thread] = theirs.list();
  assert.equal(thread!.text, "Энэ үгийг солих уу?");
  assert.equal(thread!.quote, "байна");
  assert.equal(thread!.name, "Бат");
  assert.equal(thread!.mine, false);
  assert.equal(mine.list()[0]!.mine, true);
  assert.deepEqual([thread!.from, thread!.to], [5, 10]);

  b.getText("t").insert(0, "Өглөө. ");
  assert.deepEqual(mine.spans(), [{ id, from: 12, to: 17 }]);
  a.getText("t").insert(14, "й");
  assert.deepEqual(mine.spans(), [{ id, from: 12, to: 18 }]);
  assert.equal(mine.at(12), id);
  assert.equal(mine.at(18), id);
  assert.equal(mine.at(3), null);

  b.getText("t").delete(12, 6);
  const gone = theirs.list()[0]!;
  assert.equal(gone.from, null);
  assert.deepEqual(theirs.spans(), []);
});

test("хариулт, шийдсэн төлөв, засах ба устгах эрх", () => {
  const [a, b] = pair();
  a.getText("t").insert(0, "Нэг хоёр гурав");
  const mine = open(a, "aaa");
  const theirs = open(b, "bbb");
  const id = mine.add(draftOf(mine, a, "хоёр"), "Тоо зөв үү")!;

  assert.equal(theirs.reply(id, "Зөв"), true);
  assert.equal(theirs.reply("missing", "Зөв"), false);
  assert.equal(theirs.reply(id, "   "), false);
  const reply = mine.list()[0]!.replies[0]!;
  assert.equal(reply.text, "Зөв");
  assert.equal(reply.mine, false);
  assert.equal(theirs.reply(reply.id, "хариултанд хариулт"), false);

  assert.equal(theirs.edit(id, "хакердсан"), false);
  assert.equal(theirs.remove(id), false);
  assert.equal(mine.edit(id, "Тоо зөв бичигдсэн үү"), true);
  assert.equal(theirs.list()[0]!.text, "Тоо зөв бичигдсэн үү");
  assert.equal(theirs.list()[0]!.edited, true);

  assert.equal(theirs.resolve(id, true), true);
  assert.equal(mine.list()[0]!.resolved, true);
  assert.deepEqual(mine.spans(), []);
  assert.equal(mine.resolve(id, false), true);
  assert.equal(theirs.list()[0]!.resolved, false);

  assert.equal(mine.remove(id), true);
  assert.deepEqual(theirs.list(), []);
  assert.equal(b.getMap("comments").size, 0);
});

test("ноорог зөвхөн editor-той таарах сонголтоос үүснэ", () => {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "абв гдеж");
  const comments = open(doc, "aaa");
  assert.ok(comments.draft(0, 3, "абв"));
  assert.equal(comments.draft(0, 3, "өөр"), null);
  assert.equal(comments.draft(3, 3, ""), null);
  assert.equal(comments.draft(3, 4, " "), null);
  assert.equal(comments.draft(0, 99, "абв"), null);
  doc.getText("t").insert(8, " " + "я".repeat(MAX_QUOTE * 2));
  const long = doc.getText("t").toString();
  assert.equal(comments.draft(0, long.length, long)!.quote.length, MAX_QUOTE);
  const none = createComments({
    doc,
    texts: () => new Map(),
    active: () => null,
    author: "aaa",
    profile: () => ({ name: "Би", color: 0 }),
  });
  assert.equal(none.draft(0, 3, "абв"), null);
});

test("хуурамч оруулгыг шүүж, зохиогчийн түлхүүр өрөө бүрт өөр", () => {
  const [a, b] = pair();
  a.getText("t").insert(0, "текст");
  const mine = open(a, "aaa");
  b.getMap("comments").set("bad", { i: "bad", t: "x" });
  b.getMap("comments").set("x1", {
    i: "x1",
    n: "Хуурамч",
    c: 1,
    a: 1,
    t: "хоёулаа",
    u: "ccc",
    f: "AA",
    h: "AA",
    q: "",
    o: "y",
  });
  assert.equal(a.getMap("comments").size, 0);
  assert.deepEqual(mine.list(), []);
  assert.equal(validComment("x", { i: "y" }), false);
  assert.notEqual(authorKey("dev", "r1"), authorKey("dev", "r2"));
  assert.equal(authorKey("dev", "r1"), authorKey("dev", "r1"));
  assert.ok(authorKey("dev", "r1").length <= 16);
});

test("шүүмжийн самбар бичих, хариулах, шийдэх, засахыг харуулна", () => {
  const doc = new Y.Doc();
  doc.getText("t").insert(0, "Сайн байна уу");
  const comments = open(doc, "aaa", "Бат");
  const revealed: CommentThread[] = [];
  const view = commentsView(comments, (thread) => void revealed.push(thread));
  document.body.append(view.el);
  view.shown(true);
  const empty = view.el.querySelector<HTMLElement>(".talk-empty")!;
  assert.equal(empty.hidden, false);

  view.compose(draftOf(comments, doc, "байна"));
  const form = view.el.querySelector<HTMLFormElement>(".talk-compose")!;
  assert.equal(form.hidden, false);
  assert.equal(form.querySelector(".talk-compose-quote")!.textContent, "байна");
  const input = form.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = "Шүүмж нэг";
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(form.hidden, true);
  assert.equal(empty.hidden, true);
  const row = view.el.querySelector<HTMLElement>(".talk-thread")!;
  assert.ok(row.classList.contains("is-active"));
  assert.equal(row.querySelector(".talk-msg-text")!.textContent, "Шүүмж нэг");
  assert.equal(
    view.el.querySelector(".talk-changes-count")!.textContent,
    commentsCount(1),
  );

  row.querySelector<HTMLButtonElement>(".talk-quote")!.click();
  assert.equal(revealed[0]!.from, 5);

  const reply = row.querySelector<HTMLTextAreaElement>(".talk-reply-input")!;
  reply.value = "Хариу";
  reply.dispatchEvent(new window.Event("input"));
  reply.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  const fresh = view.el.querySelector<HTMLElement>(".talk-thread")!;
  assert.equal(
    fresh.querySelector(".talk-reply .talk-msg-text")!.textContent,
    "Хариу",
  );

  fresh.querySelector<HTMLButtonElement>('[aria-label="Засах"]')!.click();
  const edit = view.el.querySelector<HTMLTextAreaElement>(".talk-edit")!;
  assert.equal(edit.value, "Шүүмж нэг");
  edit.value = "Шүүмж хоёр";
  edit.dispatchEvent(new window.Event("input"));
  edit.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(comments.list()[0]!.text, "Шүүмж хоёр");
  assert.match(
    view.el.querySelector(".talk-thread .talk-msg-time")!.textContent!,
    /засварласан/,
  );

  view.el
    .querySelector<HTMLButtonElement>('[aria-label="Шийдсэн гэж тэмдэглэх"]')!
    .click();
  assert.equal(view.el.querySelector(".talk-thread"), null);
  const toggle = view.el.querySelector<HTMLButtonElement>(
    ".talk-changes-bar .talk-accept-all",
  )!;
  assert.equal(toggle.textContent, resolvedLabel(1, false));
  toggle.click();
  assert.ok(view.el.querySelector(".talk-thread.is-resolved"));
  assert.equal(view.el.querySelector(".talk-reply-input"), null);
  view.destroy();
  view.el.remove();
});
