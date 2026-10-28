import { test } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.ts";
import { newLink, newToken } from "../src/collab/collabkey.ts";
import { joinRoom } from "../src/collab/roomjoin.ts";
import { fileSlot, invitedUid, type RoomSlot } from "../src/collab/roomslot.ts";
import type { CollabProject } from "../src/collab/collabtypes.ts";

const dom = installDom();
test.after(() => dom.close());

function deps(prepared: boolean, opened = true) {
  const notes: string[] = [];
  const prepares: [string, string][] = [];
  const project = {
    uid: () => null,
    hooks: () => {
      throw new Error("unused");
    },
    prepare: (name: string, uid: string) => {
      prepares.push([name, uid]);
      return prepared;
    },
  } as unknown as CollabProject;
  return {
    notes,
    prepares,
    deps: {
      slot: (): RoomSlot => fileSlot("file-1"),
      showSlot: () => false,
      openSlot: () => opened,
      notify: (message: string) => void notes.push(message),
      project,
    },
  };
}

test("төслийн урилгаар нэгдэхэд төслийг бэлдэж, нэгдэж буй гэж тэмдэглэнэ", async () => {
  const link = { ...newLink(), invite: newToken(), name: "Дипломын ажил/" };
  const ready = deps(true);
  const rooms = (await joinRoom(() => [], link, ready.deps))!;
  const uid = invitedUid(link.room);
  assert.deepEqual(ready.prepares, [["Дипломын ажил", uid]]);
  assert.deepEqual(rooms, [
    {
      slot: "project:" + uid,
      room: link.room,
      key: link.key,
      access: { kind: "i", token: link.invite },
      joining: "Дипломын ажил",
    },
  ]);
  assert.equal(await joinRoom(() => [], link, deps(false).deps), null);
});

test("файлын талбар нээгдэхгүй бол сануулаад нэгдэхгүй", async () => {
  const link = { ...newLink(), invite: newToken(), name: "a.md" };
  const busy = deps(true, false);
  assert.equal(await joinRoom(() => [], link, busy.deps), null);
  assert.match(busy.notes[0]!, /Шинэ файлын талбар нээх боломжгүй/);
});

test("асуулт нээлттэй байх хооронд нэмэгдсэн өрөөг нэгдэхэд дарж бичихгүй", async () => {
  const link = { ...newLink(), invite: newToken(), name: "Төсөл/" };
  const other = {
    slot: "file:file-2",
    room: newLink().room,
    key: newLink().key,
    access: { kind: "o" as const, token: newToken() },
  };
  let list: (typeof other)[] = [];
  const ready = deps(true);
  const project = ready.deps.project as unknown as {
    prepare: (name: string, uid: string) => Promise<boolean>;
  };
  project.prepare = async () => {
    list = [other];
    return true;
  };
  const rooms = (await joinRoom(() => list, link, ready.deps))!;
  assert.deepEqual(
    rooms.map((entry) => entry.room),
    [other.room, link.room],
  );
});
