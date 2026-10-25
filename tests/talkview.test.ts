import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { memoryMine } from "./helpers/memorymine.ts";
import { createChat } from "../src/collab/chat.ts";

import type { Change } from "../src/collab/changes.ts";
import type { ChangeTracker } from "../src/collab/changetracker.ts";
import type { Talk } from "../src/collab/talk.ts";
import {
  changeTitle,
  changesCount,
  changesView,
  chatView,
  clip,
  clockOf,
} from "../src/collab/talkview.ts";
import { initTalk } from "../src/collab/talkhost.ts";
import type { TalkKind } from "../src/collab/collab.ts";

const dom = installDom(
  '<aside class="project-panel"><div class="project-head"></div>' +
    '<div class="project-tree"></div><div class="project-foot">' +
    '<button class="project-foot-btn">Архивлах</button></div></aside>' +
    '<textarea id="editor"></textarea><button id="collabBtn"></button>',
);
(globalThis as Record<string, unknown>).requestAnimationFrame = (
  run: () => void,
) => setTimeout(run, 0);
test.after(() => dom.close());

const wait = (ms = 200): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const change = (over: Partial<Change> = {}): Change => ({
  key: "k1",
  path: null,
  from: 5,
  inserted: "уу ",
  removed: "",
  author: { name: "Зочин", color: 3 },
  before: "Сайн ",
  after: "байна",
  ...over,
});

function fakeTracker(list: Change[]) {
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const tracker: ChangeTracker = {
    list: () => list,
    ready: () => true,
    accept: (item) => void calls.push("accept " + item.key),
    acceptAll: () => void calls.push("all"),
    reject: (item) => void calls.push("reject " + item.key),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => listeners.clear(),
  };
  return { tracker, calls, emit: () => listeners.forEach((l) => l()) };
}

function fakeTalk(project: boolean, list: Change[] = [change()]) {
  const doc = new Y.Doc();
  const chat = createChat(doc, memoryMine(), () => ({ name: "Би", color: 1 }));
  const changes = fakeTracker(list);
  const talk: Talk = {
    chat,
    changes: changes.tracker,
    project,
    announce: () => {},
  };
  return { talk, doc, changes };
}

test("цаг, тоо, өөрчлөлтийн гарчгийг монголоор бичнэ", () => {
  const at = new Date(2026, 9, 25, 9, 5).getTime();
  assert.equal(clockOf(at, at), "09:05");
  assert.equal(clockOf(at, at + 2 * 86_400_000), "10/25 09:05");
  assert.equal(changesCount(0), "Өөрчлөлт алга");
  assert.equal(clip("аб"), "аб");
  assert.equal(clip("а".repeat(700)).length, 601);
  assert.equal(changesCount(3), "3 өөрчлөлт");
  assert.equal(changeTitle(change()), "Зочин нэмсэн");
  assert.equal(changeTitle(change({ removed: "x" })), "Зочин сольсон");
  assert.equal(
    changeTitle(change({ author: null, removed: "x" })),
    "Солигдсон",
  );
  assert.equal(changeTitle(change({ author: null })), "Нэмэгдсэн");
  assert.equal(
    changeTitle(change({ inserted: "", removed: "x" })),
    "Устгагдсан",
  );
});

test("chat харагдац мессеж илгээж, Enter-ээр илгээж, уншсан гэж тэмдэглэнэ", () => {
  const doc = new Y.Doc();
  const chat = createChat(doc, memoryMine(), () => ({ name: "Би", color: 1 }));
  const other = createChat(doc, memoryMine(), () => ({ name: "Чи", color: 2 }));
  const view = chatView(chat);
  document.body.append(view.el);
  const empty = view.el.querySelector<HTMLElement>(".talk-empty")!;
  assert.equal(empty.hidden, false);
  other.send("Сайн уу");
  assert.equal(chat.unread(), 1);
  view.shown(true);
  assert.equal(chat.unread(), 0);
  assert.equal(empty.hidden, true);
  const input = view.el.querySelector<HTMLTextAreaElement>(".talk-input")!;
  input.value = "Сайн";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(input.value, "");
  input.value = "мөр";
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }),
  );
  assert.equal(input.value, "мөр");
  view.el.querySelector("form")!.dispatchEvent(new Event("submit"));
  const texts = [...view.el.querySelectorAll(".talk-msg-text")].map(
    (node) => node.textContent,
  );
  assert.deepEqual(texts, ["Сайн уу", "Сайн", "мөр"]);
  assert.equal(view.el.querySelectorAll(".talk-msg.is-mine").length, 2);
  view.shown(false);
  view.destroy();
  view.el.remove();
});

test("өөрчлөлтийн харагдац жагсааж, зөвшөөрч, татгалзаж, байрлал руу очно", () => {
  const { tracker, calls, emit } = fakeTracker([
    change(),
    change({ key: "k2", path: "ch.tex", inserted: "", removed: "хуучин" }),
  ]);
  const revealed: string[] = [];
  const view = changesView(tracker, (item) => void revealed.push(item.key));
  view.shown(true);
  emit();
  assert.equal(
    view.el.querySelector(".talk-changes-count")!.textContent,
    "2 өөрчлөлт",
  );
  const rows = view.el.querySelectorAll(".talk-change");
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.querySelector("ins")!.textContent, "уу ");
  assert.equal(rows[1]!.querySelector("del")!.textContent, "хуучин");
  assert.equal(
    rows[1]!.querySelector(".talk-change-path")!.textContent,
    "ch.tex",
  );
  rows[0]!.querySelector<HTMLElement>(".talk-change-show")!.click();
  rows[0]!.querySelectorAll<HTMLElement>(".talk-change-act")[0]!.click();
  rows[1]!.querySelector<HTMLElement>(".talk-change-act.is-reject")!.click();
  view.el.querySelector<HTMLElement>(".talk-send")!.click();
  assert.deepEqual(revealed, ["k1"]);
  assert.deepEqual(calls, ["accept k1", "reject k2", "all"]);
  view.destroy();
});

test("төслийн самбарт товч нэмж, бусад бичвэрт цонх нээнэ", async () => {
  const project = fakeTalk(true, [change({ path: "ch.tex" })]);
  const file = fakeTalk(false);
  const talks: Record<TalkKind, Talk | null> = { project: null, file: null };
  let notify = (): void => {};
  const opened: string[] = [];
  const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
  editor.value = "Сайн уу байна";
  initTalk({
    collab: {
      talk: (kind) => talks[kind],
      onTalk: (listener) => void (notify = listener),
    },
    editor,
    openPath: (path) => void opened.push(path),
    anchor: document.querySelector("#collabBtn"),
  });
  const foot = document.querySelector(".project-foot")!;
  const toggles = [...foot.querySelectorAll<HTMLButtonElement>(".talk-toggle")];
  assert.deepEqual(
    [...foot.children].map(
      (node) => node.getAttribute("aria-label") ?? node.textContent,
    ),
    ["Өөрчлөлт", "Хэлэлцэх", "Архивлах"],
  );
  assert.ok(toggles.every((node) => node.hidden));
  const trigger = document.querySelector<HTMLButtonElement>(".talk-trigger")!;
  assert.equal(trigger.hidden, true);

  talks.project = project.talk;
  talks.file = file.talk;
  notify();
  assert.ok(toggles.every((node) => !node.hidden));
  const panel = document.querySelector(".project-panel")!;
  toggles[0]!.click();
  assert.ok(panel.classList.contains("is-talk"));
  assert.equal(
    document.querySelector(".project-talk-title")!.textContent,
    "Өөрчлөлт",
  );
  project.changes.emit();
  document
    .querySelector<HTMLElement>(".project-talk .talk-change-show")!
    .click();
  assert.deepEqual(opened, ["ch.tex"]);
  await wait(20);
  assert.equal(editor.selectionStart, 5);
  assert.equal(editor.selectionEnd, 8);
  toggles[1]!.click();
  assert.equal(
    document.querySelector(".project-talk-title")!.textContent,
    "Хэлэлцэх",
  );
  toggles[1]!.click();
  assert.equal(panel.classList.contains("is-talk"), false);

  createChat(file.doc, memoryMine(), () => ({ name: "Чи", color: 2 })).send(
    "Сайн",
  );
  assert.equal(trigger.querySelector(".talk-badge")!.textContent, "1");
  trigger.click();
  const win = document.querySelector<HTMLElement>(".talk-window")!;
  assert.equal(win.hidden, false);
  assert.equal(trigger.querySelector(".talk-badge"), null);
  const tabs = win.querySelectorAll<HTMLButtonElement>(".talk-tab");
  tabs[1]!.click();
  assert.equal(tabs[1]!.getAttribute("aria-selected"), "true");
  file.changes.emit();
  win.querySelector<HTMLElement>(".talk-change-show")!.click();
  assert.equal(editor.selectionStart, 5);
  win.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(win.hidden, true);
  trigger.click();
  win.querySelector<HTMLElement>(".project-act")!.click();
  assert.equal(win.hidden, true);

  talks.file = null;
  talks.project = null;
  notify();
  assert.equal(trigger.hidden, true);
  assert.ok(toggles.every((node) => node.hidden));
});
