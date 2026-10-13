import test from "node:test";
import assert from "node:assert/strict";

import {
  FILE_LIMIT,
  isFileSlot,
  nextFileId,
  parseSlots,
  textSum,
} from "../src/fileslots.ts";

test("nextFileId: хамгийн их дугаараас дараагийнхыг өгнө", () => {
  assert.equal(nextFileId([]), "file-1");
  assert.equal(
    nextFileId([
      { id: "file-2", name: "a.txt", sum: null },
      { id: "file-7", name: "b.md", sum: null },
    ]),
    "file-8",
  );
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
