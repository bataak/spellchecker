import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { memoryMine } from "./helpers/memorymine.ts";
import { createChat } from "../src/collab/chat.ts";
import { createComments } from "../src/collab/comments.ts";

import type { Change } from "../src/collab/changes.ts";
import type { ChangeTracker } from "../src/collab/changetracker.ts";
import type { Talk } from "../src/collab/talk.ts";
import {
  changeTitle,
  chatView,
  clip,
  clockOf,
} from "../src/collab/talkview.ts";
import {
  changesCount,
  changesView,
  rejectedLabel,
} from "../src/collab/changesview.ts";
import { initTalk } from "../src/collab/talkhost.ts";
import type { TalkKind } from "../src/collab/collab.ts";

const dom = installDom(
  '<aside class="project-panel"><div class="project-head"></div>' +
    '<div class="project-tree"></div><div class="project-foot">' +
    '<button class="project-foot-btn">Архивлах</button></div></aside>' +
    '<div class="workspace"><div class="editor-wrap">' +
    '<textarea id="editor"></textarea></div></div><button id="collabBtn"></button>',
);
(globalThis as Record<string, unknown>).requestAnimationFrame = (
  run: () => void,
) => setTimeout(run, 0);
test.after(() => dom.close());

const offlineDeps = {
  doc: () => null,
  profile: () => ({ name: "Би", color: 1 }),
  notes: {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    drop: () => Promise.resolve(),
  },
};

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
    accept: (item) => {
      calls.push("accept " + item.key);
      return () => void calls.push("unaccept " + item.key);
    },
    acceptAll: () => {
      calls.push("all");
      return () => void calls.push("unall");
    },
    reject: (item) => {
      calls.push("reject " + item.key);
      return "r-" + item.key;
    },
    rejected: () => [],
    restore: (id) => {
      calls.push("restore " + id);
      return true;
    },
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
  const text = doc.getText("t");
  const comments = createComments({
    doc,
    texts: () => new Map([[null, text]]),
    active: () => text,
    author: "me",
    profile: () => ({ name: "Би", color: 1 }),
  });
  const talk: Talk = {
    chat,
    changes: changes.tracker,
    comments,
    slot: null,
    room: "r1",
    project,
    announce: () => {},
  };
  return { talk, doc, changes };
}

test("цаг, тоо, өөрчлөлтийн гарчгийг монголоор бичнэ", () => {
  const at = new Date(2026, 9, 25, 9, 5).getTime();
  assert.equal(clockOf(at, at), "09:05");
  assert.equal(clockOf(at, at + 2 * 86_400_000), "10/25 09:05");
  assert.equal(changesCount(0), "Өөрчлөлтгүй");
  assert.equal(clip("аб"), "аб");
  assert.equal(clip("а".repeat(700)).length, 601);
  assert.equal(changesCount(3), "3 өөрчлөлт");
  assert.equal(changeTitle(change()), "Зочин нэмсэн");
  assert.equal(changeTitle(change({ removed: "x" })), "Зочин сольсон");
  assert.equal(
    changeTitle(change({ author: { name: "Чоно", color: 1, mine: true } })),
    "Чоно (та) нэмсэн",
  );
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
  view.el.querySelector<HTMLElement>(".talk-accept-all")!.click();
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
    view: {
      host: document.querySelector(".editor-wrap")!,
      rangeRects: () => [],
    },
    ...offlineDeps,
    anchor: document.querySelector("#collabBtn"),
    workspace: document.querySelector(".workspace"),
    editorWrap: document.querySelector(".editor-wrap"),
  });
  const foot = document.querySelector(".project-foot")!;
  const pair = foot.querySelector<HTMLElement>(".talk-pair")!;
  const toggles = [...pair.querySelectorAll<HTMLButtonElement>(".talk-toggle")];
  assert.deepEqual(
    toggles.map((node) => node.getAttribute("aria-label")),
    ["Өөрчлөлт", "Хэлэлцүүлэг", "Шүүмж"],
  );
  assert.deepEqual(
    [...foot.children].map((node) => node.className),
    ["talk-pair", "project-foot-btn"],
  );
  assert.equal(pair.hidden, true);
  const trigger = document.querySelector<HTMLButtonElement>(".talk-trigger")!;
  assert.equal(trigger.hidden, true);
  assert.equal(trigger.textContent!.trim(), "Хэлэлцэх");

  talks.project = project.talk;
  talks.file = file.talk;
  notify();
  assert.equal(pair.hidden, false);
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
    "Хэлэлцүүлэг",
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
  assert.equal(win.nextElementSibling?.className, "editor-wrap");
  assert.ok(document.documentElement.hasAttribute("data-talk"));
  assert.equal(
    win.querySelector(".talk-input")!.getAttribute("placeholder"),
    "Зурвас илгээх...",
  );
  assert.equal(win.querySelector(".talk-form button"), null);
  assert.equal(trigger.querySelector(".talk-badge"), null);
  const tabs = win.querySelectorAll<HTMLButtonElement>(".talk-tab");
  tabs[1]!.click();
  assert.equal(tabs[1]!.getAttribute("aria-selected"), "true");
  file.changes.emit();
  win.querySelector<HTMLElement>(".talk-change-show")!.click();
  assert.equal(editor.selectionStart, 5);
  win.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(win.hidden, true);
  assert.equal(document.documentElement.hasAttribute("data-talk"), false);
  trigger.click();
  win.querySelector<HTMLElement>(".project-act")!.click();
  assert.equal(win.hidden, true);

  talks.file = null;
  talks.project = null;
  notify();
  assert.equal(trigger.hidden, true);
  assert.equal(pair.hidden, true);
});

test("бичвэр солигдоход chat-ийн сонсогч давхардахгүй", () => {
  const first = fakeTalk(false);
  const second = fakeTalk(false);
  let active = 0;
  const counted = (talk: Talk): Talk => ({
    ...talk,
    chat: {
      ...talk.chat,
      onChange(listener) {
        active++;
        const off = talk.chat.onChange(listener);
        return () => {
          active--;
          off();
        };
      },
    },
  });
  const talks = [counted(first.talk), counted(second.talk)];
  let current: Talk | null = talks[0]!;
  let notify = (): void => {};
  initTalk({
    collab: {
      talk: (kind) => (kind === "file" ? current : null),
      onTalk: (listener) => void (notify = listener),
    },
    editor: document.querySelector<HTMLTextAreaElement>("#editor")!,
    openPath: () => {},
    view: {
      host: document.querySelector(".editor-wrap")!,
      rangeRects: () => [],
    },
    ...offlineDeps,
    anchor: null,
    workspace: null,
    editorWrap: null,
  });
  const base = active;
  for (let round = 0; round < 5; round++) {
    current = talks[round % 2]!;
    notify();
  }
  assert.equal(active, base);
});

test("татгалзсаны дараа мэдэгдлээр буцааж, жагсаалтаас сэргээнэ", () => {
  const { tracker, calls, emit } = fakeTracker([change()]);
  const records = [
    {
      id: "r1",
      at: Date.now(),
      path: null,
      inserted: "уу ",
      removed: "",
      author: { name: "Зочин", color: 3 },
      before: "Сайн ",
      after: "байна",
      start: "x",
      end: "y",
    },
  ];
  tracker.rejected = () => records;
  const view = changesView(tracker, () => {});
  document.body.append(view.el);
  view.shown(true);
  emit();
  view.el
    .querySelector<HTMLButtonElement>(".talk-change-act.is-reject")!
    .click();
  const snack = document.querySelector(".snackbar")!;
  assert.match(snack.textContent!, /Татгалзлаа/);
  snack.querySelector<HTMLButtonElement>(".snackbar-action")!.click();
  assert.deepEqual(calls.slice(-2), ["reject k1", "restore r-k1"]);
  assert.equal(document.querySelector(".snackbar"), null);

  view.el.querySelector<HTMLButtonElement>(".talk-change-act")!.click();
  document
    .querySelector<HTMLButtonElement>(".snackbar .snackbar-action")!
    .click();
  assert.deepEqual(calls.slice(-2), ["accept k1", "unaccept k1"]);

  const toggle = [
    ...view.el.querySelectorAll<HTMLButtonElement>(".talk-changes-bar button"),
  ].find((node) => node.textContent!.startsWith("Татгалзсаныг"))!;
  assert.equal(toggle.textContent, rejectedLabel(1, false));
  const gone = view.el.querySelector<HTMLElement>(".talk-rejected-list")!;
  assert.equal(gone.hidden, true);
  toggle.click();
  assert.equal(gone.hidden, false);
  assert.match(gone.textContent!, /Зочин нэмсэн/);
  gone.querySelector<HTMLButtonElement>("button")!.click();
  assert.equal(calls.at(-1), "restore r1");
  view.destroy();
  view.el.remove();
});
