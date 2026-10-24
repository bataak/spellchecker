import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { bindText } from "../src/collab/textbind.ts";
import { remoteChanges } from "../src/editor/editortext.ts";
import { createAttacher } from "../src/collab/session.ts";
import {
  DENIED_CODE,
  ENDED_CODE,
  FULL_CODE,
  PURGED_CODE,
  REMOVED_CODE,
  WIPED_CODE,
  openSignal,
} from "../src/collab/signal.ts";
import {
  createCursors,
  decodeCursor,
  encodeCursor,
} from "../src/collab/cursors.ts";
import { profileFor } from "../src/collab/profile.ts";
import { watchIdle } from "../src/collab/idle.ts";
import { openDialog } from "../src/collab/collabdialog.ts";
import type { Member } from "../src/collab/admin.ts";
import type { Session } from "../src/collab/session.ts";

const dom = installDom("<textarea id=a></textarea><textarea id=b></textarea>");
test.after(() => dom.close());

function pair(): {
  a: HTMLTextAreaElement;
  b: HTMLTextAreaElement;
  docA: Y.Doc;
  docB: Y.Doc;
} {
  const a = document.querySelector<HTMLTextAreaElement>("#a")!;
  const b = document.querySelector<HTMLTextAreaElement>("#b")!;
  a.value = "";
  b.value = "";
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  docA.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "net") Y.applyUpdate(docB, update, "net");
  });
  docB.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "net") Y.applyUpdate(docA, update, "net");
  });
  return { a, b, docA, docB };
}

function type(
  editor: HTMLTextAreaElement,
  at: number,
  text: string,
  composing = false,
): void {
  editor.setRangeText(text, at, at, "end");
  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
      isComposing: composing,
    }),
  );
}

test("нэг хүний бичсэн нь нөгөөгийн талбарт гарна", () => {
  const { a, b, docA, docB } = pair();
  docA.getText("t").insert(0, "Сайн уу");
  const bindA = bindText(a, docA.getText("t"));
  const bindB = bindText(b, docB.getText("t"));
  bindA.attach();
  bindB.attach();
  assert.equal(a.value, "Сайн уу");
  assert.equal(b.value, "Сайн уу");
  b.setSelectionRange(7, 7);
  type(a, 4, " байна");
  assert.equal(b.value, "Сайн байна уу");
  assert.equal(b.selectionStart, 13);
  type(b, 13, "!");
  assert.equal(a.value, "Сайн байна уу!");
  bindA.destroy();
  bindB.destroy();
});

test("бусдын засвар үйл явдалд өөрчлөлтийн мэдээллийг дамжуулна", () => {
  const { a, b, docA, docB } = pair();
  const bindA = bindText(a, docA.getText("t"));
  const bindB = bindText(b, docB.getText("t"));
  bindA.attach();
  bindB.attach();
  const seen: unknown[] = [];
  b.addEventListener("input", (event) => seen.push(remoteChanges(event)));
  type(a, 0, "ab");
  assert.deepEqual(seen, [[{ from: 0, to: 0, insert: "ab" }]]);
  bindA.destroy();
  bindB.destroy();
});

test("үсэг бичиж дуусаагүй үед ирсэн засварыг дараа нь нэгтгэнэ", () => {
  const { a, b, docA, docB } = pair();
  docA.getText("t").insert(0, "abc");
  const bindA = bindText(a, docA.getText("t"));
  const bindB = bindText(b, docB.getText("t"));
  bindA.attach();
  bindB.attach();
  b.dispatchEvent(new Event("compositionstart"));
  type(b, 3, "X", true);
  type(a, 0, ">");
  assert.equal(b.value, "abcX");
  b.dispatchEvent(new Event("compositionend"));
  assert.equal(b.value, ">abcX");
  assert.equal(a.value, ">abcX");
  bindA.destroy();
  bindB.destroy();
});

test("салгасан үед засвар дамжихгүй, дахин холбоход шинэчлэгдэнэ", () => {
  const { a, b, docA, docB } = pair();
  const bindA = bindText(a, docA.getText("t"));
  const bindB = bindText(b, docB.getText("t"));
  bindA.attach();
  bindB.attach();
  bindB.detach();
  b.value = "өөр бичвэр";
  type(a, 0, "шинэ");
  assert.equal(b.value, "өөр бичвэр");
  assert.equal(docB.getText("t").toString(), "шинэ");
  b.value = "шин";
  bindB.attach();
  assert.equal(b.value, "шинэ");
  bindA.destroy();
  bindB.destroy();
});

test("локал өгөгдөлгүй үед бичвэрийг устгахгүй, харин хуваалцана", () => {
  const { a, docA } = pair();
  a.value = "хадгалсан ноорог";
  const fresh = createAttacher(a, docA.getText("t"), true);
  fresh.attach();
  assert.equal(docA.getText("t").toString(), "");
  fresh.settle();
  assert.equal(docA.getText("t").toString(), "хадгалсан ноорог");
  assert.equal(a.value, "хадгалсан ноорог");
  fresh.destroy();
});

test("хуучин баримттай үед ноорогоор дарж бичихгүй", () => {
  const { a, docA } = pair();
  a.value = "хуучин ноорог";
  const known = createAttacher(a, docA.getText("t"), false);
  known.attach();
  assert.equal(docA.getText("t").toString(), "");
  assert.equal(a.value, "");
  known.destroy();
});

test("дүүрсэн өрөөнд дахин холбогдохыг оролдохгүй", async () => {
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = "";
    onopen: (() => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    constructor() {
      sockets.push(this);
    }
    send(): void {}
    close(): void {}
  }
  const saved = globalThis.WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
  const states: string[] = [];
  const signal = openSignal({
    url: () => "wss://x/room/r",
    onEvent: () => {},
    onSnapshot: () => {},
    onState: (state) => states.push(state),
  });
  sockets[0]!.onclose?.({ code: FULL_CODE });
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(sockets.length, 1);
  assert.deepEqual(states, ["connecting", "full"]);
  signal.close();
  (globalThis as Record<string, unknown>).WebSocket = saved;
});

for (const [code, state] of [
  [DENIED_CODE, "denied"],
  [REMOVED_CODE, "removed"],
  [ENDED_CODE, "ended"],
  [WIPED_CODE, "wiped"],
  [PURGED_CODE, "purged"],
] as const)
  test("хандах эрхгүй бол (" + state + ") дахин холбогдохгүй", async () => {
    const urls: string[] = [];
    let access = "i=A";
    class FakeSocket {
      static OPEN = 1;
      readyState = 0;
      binaryType = "";
      onopen: (() => void) | null = null;
      onmessage: ((event: unknown) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      constructor(url: string) {
        urls.push(url);
        sockets.push(this);
      }
      send(): void {}
      close(): void {}
    }
    const sockets: FakeSocket[] = [];
    const saved = globalThis.WebSocket;
    (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
    const states: string[] = [];
    const signal = openSignal({
      url: () => "wss://x/room/r?" + access,
      onEvent: () => {},
      onSnapshot: () => {},
      onState: (next) => states.push(next),
    });
    access = "m=B";
    sockets[0]!.onclose?.({ code });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.deepEqual(urls, ["wss://x/room/r?i=A"]);
    assert.deepEqual(states, ["connecting", state]);
    signal.close();
    (globalThis as Record<string, unknown>).WebSocket = saved;
  });

test("тасарсны дараа шинэ эрхээр дахин холбогдоно", async () => {
  const urls: string[] = [];
  const sockets: { onclose: ((event: { code: number }) => void) | null }[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    binaryType = "";
    onopen: (() => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    constructor(url: string) {
      urls.push(url);
      sockets.push(this);
    }
    send(): void {}
    close(): void {}
  }
  const saved = globalThis.WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
  let access = "i=A";
  const signal = openSignal({
    url: () => "wss://x/room/r?" + access,
    onEvent: () => {},
    onSnapshot: () => {},
    onState: () => {},
  });
  access = "m=B";
  sockets[0]!.onclose?.({ code: 1006 });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual(urls, ["wss://x/room/r?i=A", "wss://x/room/r?m=B"]);
  signal.close();
  (globalThis as Record<string, unknown>).WebSocket = saved;
});

test("курсорын мэдээллийг кодлоод задлахад байрлал хадгалагдана", () => {
  const doc = new Y.Doc();
  const text = doc.getText("t");
  text.insert(0, "Сайн уу");
  const at = Y.createRelativePositionFromTypeIndex(text, 4);
  const body = encodeCursor({ name: "Бат", color: 3 }, at, at);
  const state = decodeCursor(body)!;
  assert.equal(state.name, "Бат");
  assert.equal(state.color, 3);
  text.insert(0, ">> ");
  const moved = Y.createAbsolutePositionFromRelativePosition(state.head!, doc);
  assert.equal(moved?.index, 7);
  assert.equal(decodeCursor(new TextEncoder().encode("{}")), null);
  assert.equal(decodeCursor(new TextEncoder().encode("x")), null);
  const hidden = decodeCursor(
    encodeCursor({ name: "Бат", color: 1 }, null, null),
  );
  assert.equal(hidden?.head, null);
});

test("бусдын курсорыг нэр, өнгөтэй нь зурна", async () => {
  const { a, docA } = pair();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const text = docA.getText("t");
  text.insert(0, "abcdef");
  a.value = "abcdef";
  const view = {
    host,
    caretRect: (offset: number) => new DOMRect(offset * 10, 0, 0, 20),
    rangeRects: (start: number, end: number) => [
      new DOMRect(start * 10, 0, (end - start) * 10, 20),
    ],
  };
  const sent: Uint8Array[] = [];
  const cursors = createCursors({
    doc: docA,
    text,
    editor: a,
    view,
    profile: () => ({ name: "Би", color: 0 }),
    send: (body) => sent.push(body),
  });
  cursors.setActive(true);
  assert.equal(sent.length, 1);
  const anchor = Y.createRelativePositionFromTypeIndex(text, 1);
  const head = Y.createRelativePositionFromTypeIndex(text, 3);
  cursors.receive(
    "peer",
    encodeCursor({ name: "Сараа", color: 2 }, anchor, head),
  );
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const label = host.querySelector<HTMLElement>(".collab-label")!;
  assert.equal(label.textContent, "Сараа");
  assert.match(
    host.querySelector<HTMLElement>(".collab-caret")!.style.transform,
    /translate\(30px/,
  );
  assert.equal(host.querySelectorAll(".collab-selection").length, 1);
  cursors.drop("peer");
  assert.equal(host.querySelector(".collab-label"), null);
  cursors.destroy();
  assert.equal(host.querySelector(".collab-cursors"), null);
});

test("нэр, өнгийг төхөөрөмжөөр тогтооно", () => {
  const one = profileFor("deviceAAAAAAAAAA", null);
  assert.deepEqual(profileFor("deviceAAAAAAAAAA", ""), one);
  assert.ok(one.name.length > 0);
  assert.ok(one.color >= 0 && one.color < 8);
  assert.equal(profileFor("deviceAAAAAAAAAA", "  Бат  ").name, "Бат");
  assert.equal(profileFor("d", "x".repeat(60)).name.length, 40);
});

test("хаалтын фрейм ирэхгүй ч final мессежээр эцсийн төлөвт шилжинэ", async () => {
  const sockets: {
    onmessage: ((event: { data: string }) => void) | null;
    closed: boolean;
  }[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    binaryType = "";
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    constructor() {
      sockets.push(this);
    }
    send(): void {}
    close(): void {
      this.closed = true;
    }
  }
  const saved = globalThis.WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
  const states: string[] = [];
  const events: unknown[] = [];
  const signal = openSignal({
    url: () => "wss://x/room/r",
    onEvent: (event) => events.push(event),
    onSnapshot: () => {},
    onState: (state) => states.push(state),
  });
  sockets[0]!.onmessage?.({
    data: JSON.stringify({ t: "final", code: PURGED_CODE }),
  });
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.deepEqual(states, ["connecting", "purged"]);
  assert.equal(sockets[0]!.closed, true);
  assert.equal(sockets.length, 1);
  assert.deepEqual(events, []);
  assert.equal(signal.command({ t: "x" }), false);
  signal.close();
  (globalThis as Record<string, unknown>).WebSocket = saved;
});

test("идэвхгүй болоход унтаж, хөдөлгөөн гармагц сэрнэ", async () => {
  const events: string[] = [];
  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const watch = watchIdle(
    300,
    () => events.push("idle"),
    () => events.push("active"),
  );
  await wait(150);
  window.dispatchEvent(new Event("keydown"));
  await wait(150);
  assert.deepEqual(events, []);
  await wait(300);
  assert.deepEqual(events, ["idle"]);
  window.dispatchEvent(new Event("pointerdown"));
  window.dispatchEvent(new Event("keydown"));
  assert.deepEqual(events, ["idle", "active"]);
  await wait(450);
  assert.deepEqual(events, ["idle", "active", "idle"]);
  watch.stop();
});

test("унтах үед холболтыг хааж, сэрэхэд шууд дахин холбогдоно", async () => {
  const sockets: { closed: boolean }[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    binaryType = "";
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    constructor() {
      sockets.push(this);
    }
    send(): void {}
    close(): void {
      this.closed = true;
    }
  }
  const saved = globalThis.WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
  const states: string[] = [];
  const signal = openSignal({
    url: () => "wss://x/room/r",
    onEvent: () => {},
    onSnapshot: () => {},
    onState: (state) => states.push(state),
  });
  signal.sleep();
  assert.equal(sockets[0]!.closed, true);
  assert.equal(signal.command({ t: "x" }), false);
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(sockets.length, 1);
  signal.resume();
  assert.equal(sockets.length, 2);
  assert.deepEqual(states, ["connecting", "closed", "connecting"]);
  signal.close();
  (globalThis as Record<string, unknown>).WebSocket = saved;
});

test("хамтрагч нэгдэхэд цонхны жагсаалт өөрөө шинэчлэгдэнэ", async () => {
  const listeners = new Set<() => void>();
  let roster: Member[] = [{ dev: "o", name: "Би", online: true, owner: true }];
  const session = {
    members: async () => roster,
    watch(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as Session;
  openDialog({
    owner: true,
    session: () => Promise.resolve(session),
    started: true,
    inviteUrl: (token) => "https://x/#" + token,
    name: "Би",
    tip: null,
    rename: () => {},
    stop: () => {},
    end: async () => true,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const list = (): string =>
    document.querySelector(".collab-members ul")!.textContent ?? "";
  assert.match(list(), /Одоогоор хамтрагч алга/);
  assert.equal(listeners.size, 1);
  roster = [...roster, { dev: "a", name: "Сараа", online: true, owner: false }];
  for (const listener of listeners) listener();
  for (const listener of listeners) listener();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.match(list(), /Сараа/);
  assert.equal(
    document.querySelector(".collab-members-title")!.textContent,
    "Хамтрагч",
  );
  document.querySelector<HTMLDialogElement>(".collab-overlay")!.close();
  assert.equal(listeners.size, 0);
});

test("урилга үүсгэх хүртэл сервер рүү хандахгүй", async () => {
  let opened = 0;
  const session = {
    invite: async () => "T".repeat(22),
    members: async () => [{ dev: "o", name: "Би", online: true, owner: true }],
    watch: () => () => {},
  } as unknown as Session;
  openDialog({
    owner: true,
    started: false,
    session: () => {
      opened += 1;
      return Promise.resolve(session);
    },
    inviteUrl: (token) => "https://x/#" + token,
    name: "Би",
    tip: null,
    rename: () => {},
    stop: () => {},
    end: async () => true,
  });
  const dialog = document.querySelector<HTMLDialogElement>(".collab-overlay")!;
  const stop = dialog.querySelector<HTMLButtonElement>(".collab-stop")!;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(opened, 0);
  assert.equal(stop.hidden, true);
  assert.equal(dialog.querySelector(".collab-members"), null);
  dialog.querySelector<HTMLButtonElement>(".collab-invite > .tbtn")!.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(opened >= 1);
  assert.equal(stop.hidden, false);
  assert.ok(dialog.querySelector(".collab-members"));
  assert.equal(dialog.querySelectorAll(".collab-invite-row").length, 1);
  dialog.close();
});
