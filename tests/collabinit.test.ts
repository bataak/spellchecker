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
} from "./helpers/collabpeer.ts";
import {
  linkHash,
  newLink,
  newToken,
  parseShort,
  shortHash,
} from "../src/collab/collabkey.ts";
import { resolveShort } from "../src/collab/shortlink.ts";
import { fileSlot, type RoomSlot } from "../src/collab/roomslot.ts";
import type { Collab, CollabDeps } from "../src/collab/collab.ts";

const dom = installDom(
  "<button id=a></button><textarea id=ea></textarea>" +
    "<button id=b></button><textarea id=eb></textarea>" +
    "<button id=c></button><textarea id=ec></textarea>" +
    "<button id=d></button><textarea id=ed></textarea>" +
    "<textarea id=peer></textarea>",
);
const target = globalThis as Record<string, unknown>;
for (const name of ["location", "history", "localStorage"])
  target[name] = (dom.window as unknown as Record<string, unknown>)[name];
const nativeTimeout = globalThis.setTimeout;
target.setTimeout = (run: () => void, ms?: number) => {
  const timer = nativeTimeout(run, ms);
  if ((ms ?? 0) >= 60_000) timer.unref();
  return timer;
};
const restoreRtc = installRtc();
const restoreSocket = installSocket();

let server: CollabServer;
let initCollab: (deps: CollabDeps) => Collab;
before(async () => {
  server = await startCollab();
  await server.allow(ORIGIN);
  target.__VITE_ENV__ = { BASE_URL: "/", VITE_COLLAB_URL: server.url };
  ({ initCollab } = await import("../src/collab/collab.ts"));
});
after(async () => {
  await server.close();
  target.setTimeout = nativeTimeout;
  restoreSocket();
  restoreRtc();
  await dom.close();
});

function element<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

interface Device {
  readonly collab: Collab;
  readonly button: HTMLButtonElement;
  readonly editor: HTMLTextAreaElement;
  readonly notes: string[];
  readonly opened: string[];
}

function device(id: string, slot: RoomSlot): Device {
  const button = element<HTMLButtonElement>("#" + id);
  const editor = element<HTMLTextAreaElement>("#e" + id);
  const notes: string[] = [];
  const opened: string[] = [];
  const collab = initCollab({
    editor,
    view: {
      host: document.createElement("div"),
      caretRect: () => null,
      rangeRects: () => [],
      onRender: () => () => {},
    },
    button,
    slot: () => slot,
    openSlot: (name) => {
      opened.push(name);
      return true;
    },
    shareName: () => "тэмдэглэл.md",
    showSlot: () => false,
    blocked: () => null,
    wipe: () => false,
    notify: (message) => notes.push(message),
    project: null,
  });
  return { collab, button, editor, notes, opened };
}

function dialogButton(label: string): HTMLButtonElement {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>("dialog button"),
  ].find((button) => button.textContent === label);
  assert.ok(found, label);
  return found;
}

test("товч дарж урилга үүсгэхэд өрөө нээгдэж, хамтрагчийн засвар орж ирнэ", async () => {
  const owner = device("a", fileSlot("a"));
  assert.equal(owner.button.hidden, false);
  assert.equal(owner.button.getAttribute("aria-pressed"), "false");
  owner.collab.start();
  owner.editor.value = "Эхний мөр";

  owner.button.click();
  dialogButton("Урилга өгөх").click();
  await until(() => !!document.querySelector(".collab-link"), "invite link");
  const url = element<HTMLInputElement>(".collab-link").value;
  dialogButton("Хаах").click();
  assert.equal(owner.button.getAttribute("aria-pressed"), "true");

  const short = parseShort(new URL(url).hash);
  assert.ok(short);
  assert.ok(new URL(url).hash.length <= 34);
  const link = await resolveShort(server.url, short);
  assert.ok(link);
  assert.equal(link.name, "тэмдэглэл.md");
  const guest = await startPeer({
    endpoint: server.url,
    editor: element<HTMLTextAreaElement>("#peer"),
    link,
    access: { kind: "i", token: link.invite },
    name: "Зочин",
    seed: null,
  });
  await until(() => guest.editor.value === "Эхний мөр", "guest text");
  typeAt(guest.editor, guest.editor.value.length, ".");
  await until(() => owner.editor.value === "Эхний мөр.", "owner sees guest");

  await guest.session.stop(false);
  assert.equal(owner.collab.forget(fileSlot("a")), true);
  assert.equal(owner.collab.forget(fileSlot("a")), false);
  assert.equal(owner.button.getAttribute("aria-pressed"), "false");
  assert.deepEqual(owner.notes, []);
});

test("урилгын холбоосоор орж ирэхэд шинэ файл нээж, бичвэрийг татна", async () => {
  const link = newLink();
  const owner = await startPeer({
    endpoint: server.url,
    editor: element<HTMLTextAreaElement>("#peer"),
    link,
    access: { kind: "o", token: newToken() },
    name: "Үүсгэгч",
    seed: "Хуваалцсан бичвэр",
  });
  await until(() => owner.status()?.signal === "open", "owner open");
  const invite = await owner.session.invite();
  assert.ok(invite);

  location.hash = linkHash({
    ...link,
    invite: invite.token,
    name: "өгүүлэл.tex",
  });
  const guest = device("b", fileSlot("b"));
  guest.collab.start();
  assert.equal(location.hash, "");
  assert.deepEqual(guest.opened, ["өгүүлэл.tex"]);
  await until(
    () => guest.editor.value === "Хуваалцсан бичвэр",
    "guest text",
    15000,
  );
  await until(() => owner.status()?.peers === 1, "owner peers");
  assert.equal(guest.button.getAttribute("aria-pressed"), "true");

  assert.equal(guest.collab.forget(fileSlot("b")), true);
  assert.equal(await owner.session.end(false), true);
  await owner.session.stop(true);
  assert.deepEqual(guest.notes, []);
});

test("богино урилгын холбоосоор орж ирэхэд нэр, бичвэрийг татна", async () => {
  const link = newLink();
  assert.equal(link.key.length, 22);
  const owner = await startPeer({
    endpoint: server.url,
    editor: element<HTMLTextAreaElement>("#peer"),
    link,
    access: { kind: "o", token: newToken() },
    name: "Үүсгэгч",
    seed: "Богино холбоосын бичвэр",
  });
  await until(() => owner.status()?.signal === "open", "owner open");
  const invite = await owner.session.invite("тайлан.md");
  assert.ok(invite?.code);
  const hash = shortHash(invite.code, link.key);
  assert.ok(hash.length <= 34, hash);

  location.hash = hash;
  const guest = device("c", fileSlot("c"));
  guest.collab.start();
  assert.equal(location.hash, "");
  await until(() => guest.opened.includes("тайлан.md"), "short name", 15000);
  await until(
    () => guest.editor.value === "Богино холбоосын бичвэр",
    "short text",
    15000,
  );

  location.hash = shortHash("AAAAAAAA", link.key);
  const stranger = device("d", fileSlot("d"));
  stranger.collab.start();
  await until(() => stranger.notes.length > 0, "short gone", 15000);
  assert.match(stranger.notes[0]!, /хүчингүй/);

  assert.equal(guest.collab.forget(fileSlot("c")), true);
  assert.equal(await owner.session.end(false), true);
  await owner.session.stop(true);
});
