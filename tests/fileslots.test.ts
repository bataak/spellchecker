import test from "node:test";
import assert from "node:assert/strict";

import {
  FILE_LIMIT,
  isFileSlot,
  nextFileId,
  parseSlots,
  textSum,
} from "../src/fileslots.ts";

test("nextFileId: хаагдсан файлын дугаарыг дахин өгөхгүй", () => {
  const slots = [{ id: "file-1", name: "a.txt", sum: null }];
  const ids = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const id = nextFileId(slots);
    assert.ok(isFileSlot(id), id);
    assert.notEqual(id, "file-1");
    ids.add(id);
  }
  assert.equal(ids.size, 50);
  assert.ok(isFileSlot(nextFileId([])));
});

test("isFileSlot: зөвхөн file- угтвартай slot", () => {
  assert.equal(isFileSlot("file-3"), true);
  assert.equal(isFileSlot("letter:application"), false);
  assert.equal(isFileSlot("plain"), false);
});

test("parseSlots: эвдэрсэн, давхардсан, хэтэрсэн бичлэгийг шүүнэ", () => {
  assert.deepEqual(parseSlots(null), []);
  assert.deepEqual(parseSlots("{"), []);
  const raw = JSON.stringify([
    { id: "file-1", name: "a.txt", sum: "x" },
    { id: "file-1", name: "dup.txt" },
    { id: "plain", name: "bad" },
    { id: "file-2", name: "" },
    { id: "file-3", name: "c.md" },
  ]);
  assert.deepEqual(parseSlots(raw), [
    { id: "file-1", name: "a.txt", sum: "x" },
    { id: "file-3", name: "c.md", sum: null },
  ]);
  const many = JSON.stringify(
    Array.from({ length: 15 }, (_, i) => ({
      id: "file-" + i,
      name: i + ".txt",
    })),
  );
  assert.equal(parseSlots(many).length, FILE_LIMIT);
});

test("textSum: ижил бичвэрт ижил, өөрт өөр утга", () => {
  assert.equal(textSum("Сайн уу"), textSum("Сайн уу"));
  assert.notEqual(textSum("Сайн уу"), textSum("Сайн уу!"));
});
