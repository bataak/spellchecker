import "./helpers/mock-storage.ts";
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { installDom, type Dom } from "./helpers/dom.ts";
import { KEYS, read, write } from "../src/core/store.ts";
import {
  finishRequestedWipe,
  initWipeButton,
  requestWipe,
} from "../src/ui/wipe.ts";

const LONG_PRESS_MS = 550;
let dom: Dom;
let databases: string[];
let cachesDropped: string[];
let reloads: number;

function stub(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

beforeEach(() => {
  dom = installDom();
  databases = [];
  cachesDropped = [];
  reloads = 0;
  localStorage.clear();
  sessionStorage.clear();
  stub("location", { reload: () => reloads++ });
  stub("indexedDB", {
    deleteDatabase: (name: string) => databases.push(name),
    databases: () => Promise.resolve([{ name: "mn-spell" }, { name: "other" }]),
  });
  stub("caches", {
    delete: (name: string) => {
      cachesDropped.push(name);
      return Promise.resolve(true);
    },
  });
});

afterEach(() => dom.close());

const settle = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function button(): HTMLButtonElement {
  const node = document.createElement("button");
  document.body.append(node);
  initWipeButton(node);
  return node;
}

const dialog = (): Element | null => document.querySelector("dialog");

function click(node: HTMLElement, shiftKey = false): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    shiftKey,
  });
  node.dispatchEvent(event);
  return event;
}

function pointer(node: HTMLElement, type: string, buttons = 0): void {
  node.dispatchEvent(new PointerEvent(type, { buttons }));
}

async function finishWipe(): Promise<void> {
  finishRequestedWipe();
  await settle();
}

test("requestWipe тэмдэг тавиад reload хийж, устгалтыг дараагийн ачаалалд үлдээнэ", () => {
  localStorage.setItem("doc", "бичвэр");
  requestWipe();
  assert.equal(reloads, 1);
  assert.equal(read(KEYS.wipe), "1");
  assert.equal(localStorage.getItem("doc"), "бичвэр");
  assert.deepEqual(databases, []);
});

test("тэмдэг байвал ачаалахад бүх өгөгдлийг устгаж, тэмдгийг арилгана", async () => {
  localStorage.setItem("doc", "бичвэр");
  write(KEYS.wipe, "1");
  await finishWipe();
  assert.equal(localStorage.length, 0);
  assert.equal(read(KEYS.wipe), null);
  assert.ok(databases.includes("bichig-collab"));
  assert.ok(databases.includes("other"));
  assert.equal(databases.filter((name) => name === "mn-spell").length, 1);
  assert.deepEqual(cachesDropped, ["tex-preview", "tex-packages"]);
});

test("тэмдэггүй бол ачаалахад юуг ч устгахгүй", async () => {
  localStorage.setItem("doc", "бичвэр");
  await finishWipe();
  assert.equal(localStorage.getItem("doc"), "бичвэр");
  assert.deepEqual(databases, []);
});

test("тэмдэг бичиж чадахгүй бол шууд устгаад reload хийнэ", () => {
  const setItem = sessionStorage.setItem;
  sessionStorage.setItem = () => {
    throw new Error("quota");
  };
  localStorage.setItem("doc", "бичвэр");
  try {
    requestWipe();
  } finally {
    sessionStorage.setItem = setItem;
  }
  assert.equal(localStorage.length, 0);
  assert.ok(databases.includes("mn-spell"));
  assert.equal(reloads, 1);
});

test("энгийн товшилт устгах асуултыг нээхгүй", () => {
  const node = button();
  assert.equal(click(node).defaultPrevented, false);
  assert.equal(dialog(), null);
});

test("Shift-тэй товшилт асууж, Болих сонговол юуг ч устгахгүй", async () => {
  const node = button();
  assert.equal(click(node, true).defaultPrevented, true);
  const buttons = dialog()!.querySelectorAll("button");
  buttons[0]!.click();
  await settle();
  assert.equal(reloads, 0);
  assert.equal(read(KEYS.wipe), null);
});

test("Устгах сонговол тэмдэг тавьж reload хийнэ", async () => {
  click(button(), true);
  dialog()!.querySelectorAll("button")[1]!.click();
  await settle();
  assert.equal(reloads, 1);
  assert.equal(read(KEYS.wipe), "1");
});

test("удаан дарсны дараах товшилт асуулт нээнэ", async () => {
  const node = button();
  pointer(node, "pointerdown");
  await settle(LONG_PRESS_MS + 30);
  pointer(node, "pointerup");
  assert.equal(click(node).defaultPrevented, true);
  assert.ok(dialog());
});

test("богино дарах болон pointercancel асуулт нээхгүй", async () => {
  const node = button();
  pointer(node, "pointerdown");
  pointer(node, "pointerup");
  await settle(LONG_PRESS_MS + 30);
  assert.equal(click(node).defaultPrevented, false);
  pointer(node, "pointerdown");
  await settle(LONG_PRESS_MS + 30);
  pointer(node, "pointercancel");
  assert.equal(click(node).defaultPrevented, false);
  assert.equal(dialog(), null);
});

test("дарсан чигтээ гарвал зэвсэглэлт цуцлагдана", async () => {
  const node = button();
  pointer(node, "pointerdown");
  await settle(LONG_PRESS_MS + 30);
  pointer(node, "pointerleave", 1);
  assert.equal(click(node).defaultPrevented, false);
  assert.equal(dialog(), null);
});
