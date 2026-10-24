import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { installDom } from "./helpers/dom.ts";
import { bindText } from "../src/collab/textbind.ts";
import { remoteChanges } from "../src/editor/editortext.ts";
import { createAttacher } from "../src/collab/session.ts";
import { FULL_CODE, openSignal } from "../src/collab/signal.ts";

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
    url: "wss://x/room/r",
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
