import test from "node:test";
import assert from "node:assert/strict";
import { watchFile } from "../src/files/filewatch.ts";
import type { CurrentFile } from "../src/files/fileports.ts";

function disk(name: string, modified: number) {
  const state = { modified, text: "ХУУЧИН" };
  const handle = {
    name,
    getFile: async () =>
      new File([state.text], name, { lastModified: state.modified }),
  } as unknown as FileSystemFileHandle;
  return { state, handle };
}

function setup(dirty = false) {
  const { state, handle } = disk("a.txt", 100);
  const current: CurrentFile = { handle, name: "a.txt", stamp: 100 };
  const reopened: string[] = [];
  const notes: string[] = [];
  let returned = (): void => {};
  const check = watchFile({
    current,
    dirty: () => dirty,
    reopen: async (file) => void reopened.push(await file.text()),
    notify: (message) => void notes.push(message),
    onReturn: (listener) => (returned = listener),
  });
  return { state, current, reopened, notes, check, back: () => returned() };
}

test("watchFile: өөрчлөгдөөгүй бол юу ч хийхгүй, өөрчлөгдвөл дахин нээж мэдэгдэнэ", async () => {
  const w = setup();
  await w.check();
  assert.deepEqual(w.reopened, []);
  w.state.modified = 200;
  w.state.text = "ШИНЭ";
  await w.check();
  assert.deepEqual(w.reopened, ["ШИНЭ"]);
  assert.equal(w.current.stamp, 200);
  assert.deepEqual(w.notes, ["«a.txt» дискэн дээр өөрчлөгдсөн тул шинэчиллээ"]);
  await w.check();
  assert.equal(w.reopened.length, 1);
});

test("watchFile: хадгалаагүй засвартай бол мэдэгдэлгүйгээр дахин нээх урсгалд шилжүүлнэ", async () => {
  const w = setup(true);
  w.state.modified = 300;
  await w.check();
  assert.equal(w.reopened.length, 1);
  assert.deepEqual(w.notes, []);
});

test("watchFile: handle эсвэл тэмдэггүй, эсвэл файл алга болсон бол чимээгүй өнгөрнө", async () => {
  const w = setup();
  w.current.stamp = null;
  w.state.modified = 400;
  await w.check();
  w.current.stamp = 100;
  w.current.handle = {
    getFile: async () => {
      throw new DOMException("gone", "NotFoundError");
    },
  } as unknown as FileSystemFileHandle;
  await w.check();
  assert.deepEqual(w.reopened, []);
  w.back();
});
