import { resetStorage } from "./helpers/mock-storage.ts";
import test from "node:test";
import assert from "node:assert/strict";

import { restoreDraftFile } from "../src/app/draftfile.ts";
import { createOpenPolicy, type OpenSlots } from "../src/app/openpolicy.ts";
import { createEmitter } from "../src/core/emitter.ts";
import { watchTabs } from "../src/app/tabwatch.ts";
import { createTexMode } from "../src/app/texmode.ts";
import { createMarkupMode } from "../src/app/markupmode.ts";
import { createEditorPort } from "../src/app/ports.ts";
import { initStatus } from "../src/ui/status.ts";
import { saveDraftFile } from "../src/core/storage.ts";

const globals = globalThis as unknown as Record<string, unknown>;

test("signal: бүртгэсэн дарааллаар бүх сонсогчид хүрнэ", () => {
  const signal = createEmitter<number>();
  const seen: string[] = [];
  signal.on((v) => seen.push("a" + v));
  signal.on((v) => seen.push("b" + v));
  signal.emit(1);
  signal.emit(2);
  assert.deepEqual(seen, ["a1", "b1", "a2", "b2"]);
});

test("texMode: start хүртэл sync юу ч хийхгүй, зөвхөн өөрчлөлтөд хариулна", () => {
  let tex = false;
  const calls: string[] = [];
  const mode = createTexMode({
    isTex: () => tex,
    paint: (on) => calls.push("paint:" + on),
    changed: () => calls.push("changed"),
  });
  tex = true;
  mode.sync();
  assert.deepEqual(calls, []);
  mode.start();
  mode.sync();
  tex = false;
  mode.sync();
  mode.sync();
  assert.deepEqual(calls, ["paint:true", "paint:false", "changed"]);
});

test("markupMode: тэмдэглэгээг алгасах эсэх өөрчлөгдөхөд л дахин зурна", () => {
  let mdFile = false;
  const calls: string[] = [];
  const mode = createMarkupMode({
    isMarkdownFile: () => mdFile,
    render: async () => {
      calls.push("render");
    },
    entered: (on) => calls.push("entered:" + on),
  });
  mode.enter(false);
  assert.equal(mode.skips(), false);
  mode.enter(true);
  mode.enter(true);
  assert.equal(mode.skips(), true);
  mdFile = true;
  mode.enter(false);
  assert.equal(mode.skips(), true);
  assert.deepEqual(calls, [
    "entered:false",
    "render",
    "entered:true",
    "entered:true",
    "entered:false",
  ]);
});

test("restoreDraftFile: office файлыг сэргээж, бүтэлгүйдвэл текст болгоно", async () => {
  resetStorage();
  const calls: string[] = [];
  const deps = (officeOk: boolean) => ({
    slot: () => "s1",
    restoreOffice: async (name: string) => {
      calls.push("office:" + name);
      return officeOk;
    },
    restoreText: (ref: { name: string }) => calls.push("text:" + ref.name),
    targetName: () => "target.txt",
    opened: (name: string | null) => calls.push("opened:" + name),
  });

  await restoreDraftFile(deps(true));
  assert.deepEqual(calls, []);

  saveDraftFile({ name: "a.docx", kind: "office" }, "s1");
  await restoreDraftFile(deps(true));
  assert.deepEqual(calls.splice(0), ["office:a.docx", "opened:a.docx"]);

  await restoreDraftFile(deps(false));
  assert.deepEqual(calls.splice(0), [
    "office:a.docx",
    "text:a.docx",
    "opened:target.txt",
  ]);

  saveDraftFile({ name: "b.md", kind: "text" }, "s1");
  await restoreDraftFile(deps(true));
  assert.deepEqual(calls, ["text:b.md", "opened:target.txt"]);
});

test("editorPort: settle нь popover хааж, хадгалж, дараа нь render хийнэ", async () => {
  const calls: string[] = [];
  const el = { scrollTop: 40, scrollLeft: 7 } as HTMLTextAreaElement;
  const port = createEditorPort({
    el,
    set: (text, caret) => {
      calls.push(`set:${text}:${caret}`);
      el.scrollTop = 0;
      el.scrollLeft = 0;
    },
    insert: () => calls.push("insert"),
    render: async () => {
      calls.push("render");
      el.scrollTop = 99;
    },
    save: () => calls.push("save"),
    hidePopover: () => calls.push("hide"),
  });
  await port.replace("x", 1);
  assert.deepEqual(calls.splice(0), ["set:x:1", "hide", "save", "render"]);

  const frames: FrameRequestCallback[] = [];
  globals.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb);
  el.scrollTop = 40;
  el.scrollLeft = 7;
  await port.reformat("y", 0);
  assert.deepEqual(calls, ["set:y:0", "save", "render"]);
  assert.equal(el.scrollTop, 40);
  assert.equal(el.scrollLeft, 7);
  el.scrollTop = 900;
  while (frames.length) frames.shift()!(0);
  assert.equal(el.scrollTop, 40);
  delete globals.requestAnimationFrame;
});

function slots(state: {
  found: string | null;
  named?: string;
  dirty?: boolean;
  room?: boolean;
}): OpenSlots & { shown: string[] } {
  const shown: string[] = [];
  return {
    shown,
    findFile: () => state.found,
    findName: () => state.named ?? null,
    showFile: (id: string) => void shown.push(id),
    fileDirty: () => state.dirty ?? false,
    openFile: () => state.room ?? true,
  } as unknown as OpenSlots & { shown: string[] };
}

test("openPolicy: нээлттэй файлыг харуулж, бохир бол асууна", async () => {
  const asked: string[] = [];
  const ask = async (options: { title: string }): Promise<boolean> => {
    asked.push(options.title);
    return true;
  };
  globals.document = { querySelector: () => null };
  const hold = (): void => assert.fail("hold");
  const policy = (bar: OpenSlots) =>
    createOpenPolicy({ slots: () => bar, hold, ask });

  const clean = slots({ found: "file-1" });
  assert.equal(await policy(clean)("a.md", "h", "t"), "open");
  assert.deepEqual(clean.shown, ["file-1"]);
  assert.equal(asked.length, 0);

  const dirty = slots({ found: "file-2", dirty: true });
  assert.equal(await policy(dirty)("a.md", "h", "t"), "reload");
  assert.equal(asked.length, 1);

  const noText = slots({ found: "file-2", dirty: true });
  assert.equal(await policy(noText)("a.md", "h", null), "open");
  assert.equal(asked.length, 1);

  assert.equal(await policy(slots({ found: null }))("b.md", "h", "t"), "new");
});

test("openPolicy: ижил нэртэй, өөр агуулгатай файлыг шинэ талбаргүйгээр дахин дуудна", async () => {
  const asked: string[] = [];
  let answer = false;
  const ask = async (options: { title: string; text?: string }) => {
    asked.push(options.title + " " + (options.text ?? ""));
    return answer;
  };
  globals.document = { querySelector: () => null };
  const hold = (): void => assert.fail("hold");
  const policy = (bar: OpenSlots) =>
    createOpenPolicy({ slots: () => bar, hold, ask });

  const clean = slots({ found: null, named: "file-3" });
  assert.equal(await policy(clean)("a.txt", "new", "ШИНЭ"), "reload");
  assert.deepEqual(clean.shown, ["file-3"]);
  assert.equal(asked.length, 0);

  const dirty = slots({ found: null, named: "file-3", dirty: true });
  assert.equal(await policy(dirty)("a.txt", "new", "ШИНЭ"), "keep");
  assert.match(
    asked[0]!,
    /^«a\.txt» файл дискэн дээр өөрчлөгджээ\. Файлыг дахин дуудах уу\? Таны өөрчлөлт устаж болзошгүй\.$/,
  );
  answer = true;
  assert.equal(await policy(dirty)("a.txt", "new", "ШИНЭ"), "reload");

  const office = slots({ found: null, named: "file-4" });
  assert.equal(await policy(office)("a.docx", "new", null), "new");
});

test("openPolicy: хязгаарт хүрвэл мэдэгдэж false буцаана", async () => {
  globals.document = { querySelector: () => null };
  const held: string[] = [];
  const policy = createOpenPolicy({
    slots: () => slots({ found: null, room: false }),
    hold: (html) => void held.push(html),
  });
  assert.equal(await policy("c.md", "h", "t"), false);
  assert.equal(held.length, 1);
  assert.match(held[0]!, /хүртэл файл нээнэ/);
});

function statusEl() {
  return {
    innerHTML: "",
    offsetWidth: 0,
    classList: { add() {}, remove() {} },
  } as unknown as HTMLElement;
}

test("status: hold хугацаанд set-ийг хааж, дуусахад release дуудна", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  globals.window = globalThis;
  const el = statusEl();
  let released = 0;
  const status = initStatus(el, () => {
    released += 1;
  });
  status.set("a", false);
  status.hold("b", 1000, false);
  status.set("c", false);
  assert.equal(el.innerHTML, "b");
  t.mock.timers.tick(1000);
  assert.equal(released, 1);
  status.set("d", false);
  assert.equal(el.innerHTML, "d");
});

test("status: release нь hold-ыг цуцалж onRelease дуудахгүй", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  globals.window = globalThis;
  const el = statusEl();
  let released = 0;
  const status = initStatus(el, () => {
    released += 1;
  });
  status.hold("b", 1000, false);
  status.release();
  status.set("c", false);
  assert.equal(el.innerHTML, "c");
  t.mock.timers.tick(2000);
  assert.equal(released, 0);
});

test("status: pin тайлагдах хүртэл бусад мэдэгдлийн дараа ч эргэж харагдана", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  globals.window = globalThis;
  const el = statusEl();
  let released = 0;
  const status = initStatus(el, () => {
    released += 1;
  });
  status.pin("түгжээ");
  assert.equal(el.innerHTML, "түгжээ");
  status.set("тоолол", false);
  assert.equal(el.innerHTML, "түгжээ");
  status.hold("түр", 1000, false);
  assert.equal(el.innerHTML, "түр");
  t.mock.timers.tick(1000);
  assert.equal(el.innerHTML, "түгжээ");
  assert.equal(released, 0);
  status.pin(null);
  assert.equal(released, 1);
  status.set("тоолол", false);
  assert.equal(el.innerHTML, "тоолол");
});

test("watchTabs: ижил төсөл дахин мэдэгдэхэд sync илгээхгүй", async () => {
  delete globals.document;
  delete globals.window;
  const listeners: (() => void)[] = [];
  let uid: string | null = null;
  const peer = new BroadcastChannel("mn-spell:tabs");
  const updates: (string | null)[] = [];
  peer.onmessage = (event: MessageEvent<{ type: string; project: string }>) => {
    if (event.data.type === "update") updates.push(event.data.project);
  };
  const guard = watchTabs({
    slot: () => "project",
    project: () => uid,
    onProjectChange: (listener) => listeners.push(listener),
    warn: () => {},
  });
  const fire = (): void => listeners.forEach((listener) => listener());
  uid = "p1";
  fire();
  fire();
  uid = "p2";
  fire();
  uid = null;
  fire();
  fire();
  const end = Date.now() + 3000;
  while (updates.length < 3 && Date.now() < end)
    await new Promise((resolve) => setTimeout(resolve, 20));
  await new Promise((resolve) => setTimeout(resolve, 50));
  guard.close();
  peer.close();
  assert.deepEqual(updates, ["p1", "p2", null]);
});
