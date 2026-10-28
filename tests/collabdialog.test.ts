import { test } from "node:test";
import { CURSOR_COLORS } from "../src/collab/peercolors.ts";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import { answer, asks } from "./helpers/ask.ts";
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
  return document.querySelector<HTMLDialogElement>(".dialog-overlay")!;
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
  button(dialog, "Урилга өгөх").click();
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
  assert.equal(document.querySelector(".dialog-overlay"), null);
});

test("ганцаараа үед баталгаажуулаад зогсооно", async () => {
  const ends: boolean[] = [];
  const live = session({ members: async () => [OWNER] });
  const dialog = open({
    session: () => Promise.resolve(live),
    end: async (wipe) => (ends.push(wipe), false),
  });
  await wait();
  button(dialog, "Зогсоох").click();
  await answer("Болих");
  await wait();
  assert.deepEqual(ends, []);
  button(dialog, "Зогсоох").click();
  await answer("Зогсоох");
  await wait();
  assert.deepEqual(ends, [false]);
  assert.match(note(dialog), /Сервертэй холбогдоогүй/);
  dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assert.equal(document.querySelector(".dialog-overlay"), null);
});

test("уригдсан хүн баталгаажуулаад хамтын засвараас гарна", async () => {
  let stopped = 0;
  const dialog = open({ owner: false, stop: () => (stopped += 1) });
  assert.equal(dialog.querySelector(".collab-invite"), null);
  button(dialog, "Зогсоох").click();
  assert.match(asks()[0]!, /зогсоох уу/);
  await answer("Болих");
  await wait();
  assert.equal(stopped, 0);
  button(dialog, "Зогсоох").click();
  await answer("Зогсоох");
  await wait();
  assert.equal(stopped, 1);
  assert.equal(document.querySelector(".dialog-overlay"), null);
});

test("эхлээгүй үед «Урилга авах»-аар холбоос оруулж нэгдэнэ", () => {
  const joined: string[] = [];
  const dialog = open({
    started: false,
    join: (text) => {
      joined.push(text);
      return text.startsWith("https://");
    },
  });
  const take = button(dialog, "Урилга авах");
  const list = dialog.querySelector<HTMLElement>(".collab-invite-list")!;
  const join = dialog.querySelector<HTMLElement>(".collab-join")!;
  const hint = dialog.querySelector(".suggest-hint")!.textContent;
  assert.equal(join.hidden, true);
  assert.equal(
    [...dialog.querySelectorAll(".collab-mode-row .tbtn")].length,
    2,
  );
  take.click();
  assert.equal(join.hidden, false);
  assert.equal(list.hidden, true);
  assert.equal(dialog.querySelector(".suggest-hint")!.textContent, hint);
  const field = dialog.querySelector<HTMLInputElement>(".collab-join input")!;
  assert.equal([...dialog.querySelectorAll(".collab-join button")].length, 0);
  const paste = (text: string): void => {
    const event = new window.Event("paste", { cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => text },
    });
    field.dispatchEvent(event);
  };
  paste("буруу");
  assert.equal(field.value, "буруу");
  assert.match(note(dialog), /урилгын холбоос биш/);
  assert.equal(dialog.open, true);
  paste("  https://aldaa.bichig.dev/#j=x\n");
  assert.deepEqual(joined, ["буруу", "https://aldaa.bichig.dev/#j=x"]);
  assert.equal(document.querySelector(".dialog-overlay"), null);
});

test("эхэлсэн эсвэл нэгдэх боломжгүй үед нэгдэх талбар гарахгүй", () => {
  const started = open({ join: () => true });
  assert.equal(started.querySelector(".collab-join"), null);
  assert.equal(started.querySelector(".collab-modes"), null);
  assert.equal(
    started.querySelector<HTMLElement>(".collab-invite")!.hidden,
    false,
  );
  started.close();
  const plain = open({ started: false });
  assert.equal(plain.querySelector(".collab-join"), null);
  plain.close();
});

test("«Урилга өгөх» дарахад урилга үүсч, «Урилга авах» алга болно", async () => {
  for (const old of document.querySelectorAll(".dialog-overlay")) old.remove();
  const dialog = open({ started: false, join: () => true });
  const give = button(dialog, "Урилга өгөх");
  const take = button(dialog, "Урилга авах");
  const bold = (node: HTMLElement): boolean =>
    node.classList.contains("suggest-send");
  take.click();
  const join = dialog.querySelector<HTMLElement>(".collab-join")!;
  assert.equal(join.hidden, false);
  assert.deepEqual([bold(give), bold(take)], [false, true]);
  give.click();
  assert.equal(take.hidden, true);
  assert.equal(join.hidden, true);
  assert.equal(bold(give), true);
  await wait();
  assert.equal(dialog.querySelectorAll(".collab-invite-list > li").length, 1);
  give.click();
  await wait();
  assert.equal(dialog.querySelectorAll(".collab-invite-list > li").length, 2);
  dialog.close();
});
