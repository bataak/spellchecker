import { resetStorage } from "./helpers/mock-storage.ts";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { loadSlots, saveSlots, textSum } from "../src/slots/fileslots.ts";
import { createSlotList } from "../src/slots/slotlist.ts";
import { createDraftStore } from "../src/slots/slotstore.ts";

beforeEach(resetStorage);

test("slotlist идэвхтэй файлыг засварын бичвэрээр нь шалгана", () => {
  saveSlots([
    { id: "file-1", name: "a.md", sum: textSum("A") },
    { id: "file-2", name: "b.md", sum: textSum("B") },
  ]);
  createDraftStore().save("file-2", "B2");
  let text = "A";
  const list = createSlotList(
    () => "file-1",
    () => text,
  );
  const first = list.find("file-1")!;
  const second = list.find("file-2")!;
  assert.equal(list.text(first), "A");
  assert.equal(list.dirty(first), false);
  text = "A!";
  assert.equal(list.dirty(first), true);
  assert.equal(list.text(second), "B2");
  assert.equal(list.dirty(second), true);
});

test("slotlist хадгалагдаагүй идэвхтэй файлыг алдахгүй", () => {
  saveSlots([{ id: "file-1", name: "a.md", sum: null }]);
  const list = createSlotList(
    () => "file-1",
    () => "",
  );
  saveSlots([]);
  assert.deepEqual(
    list.stored().map((slot) => slot.id),
    ["file-1"],
  );
  list.update((slots) => [...slots, { id: "file-2", name: "b.md", sum: null }]);
  assert.deepEqual(
    loadSlots().map((slot) => slot.id),
    ["file-1", "file-2"],
  );
  assert.equal(list.dirty(list.find("file-2")!), false);
});
