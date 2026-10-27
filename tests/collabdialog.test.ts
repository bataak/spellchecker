import { test } from "node:test";
import { CURSOR_COLORS } from "../src/collab/peercolors.ts";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import { openDialog, type DialogDeps } from "../src/collab/collabdialog.ts";
import type { Member } from "../src/collab/admin.ts";
import type { Session } from "../src/collab/session.ts";

const dom = installDom();
test.after(() => dom.close());

const wait = (ms = 20): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const OWNER: Member = { dev: "o", name: "Би", online: true, owner: true };
const GUEST: Member = {
  dev: "g",
  name: "Сараа",
  online: true,
  owner: false,
  color: 2,
};

function session(extra: Partial<Session> = {}): Session {
  return {
    invite: async () => "T".repeat(22),
    members: async () => [OWNER, GUEST],
    remove: async () => [OWNER],
    watch: () => () => {},
    ...extra,
  } as unknown as Session;
}

function open(extra: Partial<DialogDeps> = {}): HTMLDialogElement {
  openDialog({
    owner: true,
    started: true,
    session: () => Promise.resolve(session()),
    inviteUrl: (token) => "https://x/#" + token,
    name: "Би",
    tip: null,
    rename: () => {},
    stop: () => {},
    end: async () => true,
    ...extra,
  });
  return document.querySelector<HTMLDialogElement>(".collab-overlay")!;
}

const note = (dialog: HTMLElement): string =>
  dialog.querySelector(".suggest-note")!.textContent ?? "";

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === label && !node.hidden,
  );
  assert.ok(found, label);
  return found;
}

function confirmWith(answer: boolean): () => void {
  const saved = window.confirm;
  window.confirm = () => answer;
  return () => {
    window.confirm = saved;
  };
}

test("урилгыг хуулж, илгээж, нэрийг солино", async () => {
  const names: string[] = [];
  const shared: string[] = [];
  const nav = navigator as unknown as Record<string, unknown>;
  nav.share = async (data: { url: string }) => void shared.push(data.url);
  const dialog = open({ tip: "Зөвлөмж", rename: (name) => names.push(name) });
  assert.ok(dialog.querySelector(".collab-tip"));
  const input = dialog.querySelector<HTMLInputElement>(".collab-name input")!;
  input.value = "Шинэ";
  input.dispatchEvent(new Event("change"));
  assert.deepEqual(names, ["Шинэ"]);
  button(dialog, "Шинэ урилга үүсгэх").click();
  await wait();
  assert.match(note(dialog), /Урилга бэлэн/);
  const row = dialog.querySelector(".collab-invite-row")!;
  button(row, "Илгээх").click();
  assert.deepEqual(shared, ["https://x/#" + "T".repeat(22)]);
  const exec = document.execCommand;
  document.execCommand = () => false;
  button(row, "Хуулах").click();
  await wait();
  assert.match(note(dialog), /Хуулж чадсангүй/);
  document.execCommand = () => true;
  button(row, "Хуулах").click();
  await wait();
  assert.match(note(dialog), /Урилгыг хууллаа/);
  assert.ok(row.classList.contains("is-copied"));
  document.execCommand = exec;
  delete nav.share;
  dialog.close();
});

test("хамтрагчийг хуулбартай нь эсвэл устгаж хасна", async () => {
  const removed: [string, boolean][] = [];
  const live = session({
    remove: async (dev: string, wipe: boolean) => {
      removed.push([dev, wipe]);
      return [OWNER, GUEST];
    },
  });
  const dialog = open({ session: () => Promise.resolve(live) });
  await wait();
  const row = dialog.querySelector<HTMLElement>(".collab-members li")!;
  assert.equal(row.style.getPropertyValue("--peer"), CURSOR_COLORS[2]);
  button(row, "Хасах").click();
  button(row, "Болих").click();
  assert.equal(
    row.querySelector<HTMLElement>(".collab-member-choice")!.hidden,
    true,
  );
  button(row, "Хасах").click();
  button(row, "Хуулбар үлдээх").click();
  await wait();
  assert.match(note(dialog), /Сараа хасагдлаа, хуулбар нь түүнд үлдлээ/);
  const next = dialog.querySelector(".collab-members li")!;
  button(next, "Хасах").click();
  button(next, "Бүрмөсөн устгах").click();
  await wait();
  assert.match(note(dialog), /Сараа хасагдаж, бичвэр нь устгагдлаа/);
  assert.deepEqual(removed, [
    ["g", false],
    ["g", true],
  ]);
  dialog.close();
});

test("хамтрагчтай үед зогсоохдоо хуулбарын талаар асууна", async () => {
  const ends: boolean[] = [];
  let ok = false;
  const dialog = open({
    end: async (wipe) => {
      ends.push(wipe);
      return ok;
    },
  });
  await wait();
  button(dialog, "Зогсоох").click();
  const choice = dialog.querySelector<HTMLElement>(".collab-end")!;
  assert.equal(choice.hidden, false);
  button(choice, "Болих").click();
  assert.equal(choice.hidden, true);
  button(dialog, "Зогсоох").click();
  button(choice, "Бүрмөсөн устгах").click();
  await wait();
  assert.match(note(dialog), /Сервертэй холбогдоогүй/);
  ok = true;
  button(choice, "Хуулбарыг үлдээх").click();
  await wait();
  assert.deepEqual(ends, [true, false]);
  assert.equal(document.querySelector(".collab-overlay"), null);
});

test("ганцаараа үед баталгаажуулаад зогсооно", async () => {
  const ends: boolean[] = [];
  const live = session({ members: async () => [OWNER] });
  const dialog = open({
    session: () => Promise.resolve(live),
    end: async (wipe) => (ends.push(wipe), false),
  });
  await wait();
  let restore = confirmWith(false);
  button(dialog, "Зогсоох").click();
  restore();
  assert.deepEqual(ends, []);
  restore = confirmWith(true);
  button(dialog, "Зогсоох").click();
  restore();
  await wait();
  assert.deepEqual(ends, [false]);
  assert.match(note(dialog), /Сервертэй холбогдоогүй/);
  dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(document.querySelector(".collab-overlay"), null);
});

test("уригдсан хүн баталгаажуулаад хамтын засвараас гарна", () => {
  let stopped = 0;
  const dialog = open({ owner: false, stop: () => (stopped += 1) });
  assert.equal(dialog.querySelector(".collab-invite"), null);
  let restore = confirmWith(false);
  button(dialog, "Зогсоох").click();
  restore();
  assert.equal(stopped, 0);
  restore = confirmWith(true);
  button(dialog, "Зогсоох").click();
  restore();
  assert.equal(stopped, 1);
  assert.equal(document.querySelector(".collab-overlay"), null);
});

test("эхлээгүй үед урилгын холбоосоор нэгдэх талбар гарна", () => {
  const joined: string[] = [];
  const dialog = open({
    started: false,
    join: (text) => {
      joined.push(text);
      return text.startsWith("https://");
    },
  });
  const field = dialog.querySelector<HTMLInputElement>(".collab-join input")!;
  field.value = "буруу";
  button(dialog, "Нэгдэх").click();
  assert.match(note(dialog), /урилгын холбоос биш/);
  assert.equal(dialog.open, true);
  field.value = "https://aldaa.bichig.dev/#j=x";
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  assert.deepEqual(joined, ["буруу", "https://aldaa.bichig.dev/#j=x"]);
  assert.equal(document.querySelector(".collab-overlay"), null);
});

test("эхэлсэн эсвэл нэгдэх боломжгүй үед нэгдэх талбар гарахгүй", () => {
  const started = open({ join: () => true });
  assert.equal(started.querySelector(".collab-join"), null);
  started.close();
  const plain = open({ started: false });
  assert.equal(plain.querySelector(".collab-join"), null);
  plain.close();
});
