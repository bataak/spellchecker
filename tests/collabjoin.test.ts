import { test } from "node:test";
import assert from "node:assert/strict";
import { arrived, resumeJoins, type CollabDeps } from "../src/collab/collab.ts";
import { parseRooms, roomById } from "../src/collab/collabrooms.ts";
import { projectSlot, slotKey } from "../src/collab/roomslot.ts";

test("төсөл ирэхээс өмнө reload хийсэн ч нэгдэлтийг үргэлжлүүлнэ", async () => {
  const invite = { kind: "i", token: "B".repeat(22) } as const;
  const joining = {
    slot: slotKey(projectSlot("cr1")),
    room: "r1",
    key: "k1",
    access: invite,
    joining: "Diplom",
  };
  const plain = { slot: "file-a", room: "r2", key: "k2", access: invite };
  const rooms = parseRooms([
    joining,
    plain,
    { ...plain, room: "r3", slot: "file-b", joining: 5 },
  ]);
  assert.deepEqual(rooms, [
    joining,
    plain,
    { ...plain, room: "r3", slot: "file-b" },
  ]);
  const prepared: string[] = [];
  const opened: string[] = [];
  const dropped: string[] = [];
  let accept = true;
  let uid: string | null = null;
  const deps = {
    project: {
      uid: () => uid,
      prepare: (name: string, at: string) => {
        prepared.push(name + "@" + at);
        return accept;
      },
    },
  } as unknown as CollabDeps;
  const registry = {
    open: (entry: { room: string }) => {
      opened.push(entry.room);
      return new Promise<never>(() => {});
    },
  };
  const drop = (entry: { room: string }): void => void dropped.push(entry.room);
  await resumeJoins(rooms, deps, registry, drop);
  assert.deepEqual([prepared, opened, dropped], [["Diplom@cr1"], ["r1"], []]);
  accept = false;
  await resumeJoins(rooms, deps, registry, drop);
  assert.deepEqual(dropped, ["r1"]);
  uid = "cr1";
  await resumeJoins(rooms, deps, registry, drop);
  assert.equal(prepared.length, 2);
  const { joining: _name, ...done } = joining;
  assert.deepEqual(roomById(arrived(rooms, "cr1")!, "r1"), done);
  assert.equal(arrived(rooms, "cr1")!.length, 3);
  assert.equal(arrived(rooms, "other"), null);
  assert.equal(arrived(rooms, null), null);
});
